export type BillingProvider = "stripe" | "google_play" | "app_store" | "promotional";
export type BillingPlan = "pro_monthly" | "pro_yearly";
export type BillingStatus = "active" | "grace_period" | "past_due" | "canceled" | "expired";
export type BillingEnvironment = "sandbox" | "production";

export const entitlementIsValid = (
  status: BillingStatus,
  periodEnd?: number,
  now = Date.now(),
) => ((status === "active" || status === "grace_period") && (periodEnd === undefined || periodEnd > now)) ||
  ((status === "canceled" || status === "past_due") && !!periodEnd && periodEnd > now);

export const hasAnyValidEntitlement = (
  rows: Array<{ status: BillingStatus; periodEnd?: number }>,
  now = Date.now(),
) => rows.some((row) => entitlementIsValid(row.status, row.periodEnd, now));

type RevenueCatEvent = {
  id?: unknown;
  type?: unknown;
  event_timestamp_ms?: unknown;
  store?: unknown;
  environment?: unknown;
  app_user_id?: unknown;
  original_app_user_id?: unknown;
  aliases?: unknown;
  entitlement_ids?: unknown;
  product_id?: unknown;
  new_product_id?: unknown;
  transaction_id?: unknown;
  original_transaction_id?: unknown;
  expiration_at_ms?: unknown;
  grace_period_expiration_at_ms?: unknown;
  cancel_reason?: unknown;
};

export type RevenueCatProducts = { monthly: Set<string>; yearly: Set<string> };

/**
 * Convex lehnt Feldnamen mit "$" ab. RevenueCat schickt reservierte Attribute wie `$attConsentStatus`
 * in `subscriber_attributes`; ohne Bereinigung scheitert jeder Webhook und Käufe kommen nie an.
 */
export function sanitizeConvexValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeConvexValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => !key.startsWith("$") && item !== undefined)
      .map(([key, item]) => [key, sanitizeConvexValue(item)]),
  );
}

const text = (value: unknown) => typeof value === "string" && value ? value : undefined;
const time = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;

export function mapRevenueCatEvent(event: RevenueCatEvent, products: RevenueCatProducts) {
  const eventId = text(event.id);
  const eventType = text(event.type);
  const eventTimestamp = time(event.event_timestamp_ms);
  if (!eventId || !eventType || !eventTimestamp) throw new Error("INVALID_REVENUECAT_EVENT");

  const supported = [
    "INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "SUBSCRIPTION_EXTENDED", "REFUND_REVERSED",
    "CANCELLATION", "EXPIRATION", "BILLING_ISSUE", "SUBSCRIPTION_PAUSED",
  ];
  const ignored = !supported.includes(eventType);
  if (ignored) return { eventId, eventType, eventTimestamp, ignored: true as const };

  const entitlementIds = Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [];
  if (!entitlementIds.includes("pro")) return { eventId, eventType, eventTimestamp, ignored: true as const };

  const provider = ({
    PLAY_STORE: "google_play",
    APP_STORE: "app_store",
    STRIPE: "stripe",
    PROMOTIONAL: "promotional",
  } as const)[text(event.store) as "PLAY_STORE"];
  if (!provider) throw new Error("UNSUPPORTED_REVENUECAT_STORE");
  if (event.environment !== "SANDBOX" && event.environment !== "PRODUCTION") {
    throw new Error("INVALID_REVENUECAT_ENVIRONMENT");
  }

  const productId = text(event.new_product_id) ?? text(event.product_id);
  if (!productId) throw new Error("MISSING_REVENUECAT_PRODUCT");
  const plan = products.monthly.has(productId)
    ? "pro_monthly"
    : products.yearly.has(productId)
      ? "pro_yearly"
      : undefined;
  if (!plan) throw new Error("UNKNOWN_REVENUECAT_PRODUCT");

  const expiration = time(event.expiration_at_ms);
  const graceExpiration = time(event.grace_period_expiration_at_ms);
  let status: BillingStatus = "active";
  let willRenew = true;
  let periodEnd = expiration;

  if (eventType === "EXPIRATION" || (eventType === "CANCELLATION" && event.cancel_reason === "CUSTOMER_SUPPORT")) {
    status = "expired";
    willRenew = false;
  } else if (eventType === "CANCELLATION" || eventType === "SUBSCRIPTION_PAUSED") {
    status = "canceled";
    willRenew = false;
  } else if (eventType === "BILLING_ISSUE") {
    status = graceExpiration && graceExpiration > Date.now() ? "grace_period" : "past_due";
    periodEnd = graceExpiration ?? expiration;
  }

  const billingUserIds = [event.app_user_id, event.original_app_user_id, ...(Array.isArray(event.aliases) ? event.aliases : [])]
    .map(text)
    .filter((value): value is string => !!value);
  if (!billingUserIds.length) throw new Error("MISSING_REVENUECAT_USER");

  return {
    eventId,
    eventType,
    eventTimestamp,
    ignored: false as const,
    billingUserIds: [...new Set(billingUserIds)],
    provider: provider as BillingProvider,
    externalSubscriptionId: text(event.original_transaction_id) ?? text(event.transaction_id),
    productId,
    plan: plan as BillingPlan,
    status,
    periodEnd,
    willRenew,
    environment: event.environment === "SANDBOX" ? "sandbox" as const : "production" as const,
  };
}

/** Abo aus der RevenueCat-API v2 (GET /projects/{id}/customers/{id}/subscriptions). */
export type RevenueCatSubscription = {
  product_id?: string | null;
  store?: string;
  environment?: string;
  status?: string;
  gives_access?: boolean;
  auto_renewal_status?: string;
  current_period_ends_at?: number | null;
  ends_at?: number | null;
  entitlements?: { items?: Array<{ lookup_key?: string }> };
};

export type StoreEntitlement = {
  provider: Exclude<BillingProvider, "stripe">;
  productId: string;
  plan: BillingPlan;
  status: BillingStatus;
  periodEnd?: number;
  willRenew: boolean;
  environment: BillingEnvironment;
};

const STORE_PROVIDER: Record<string, StoreEntitlement["provider"]> = {
  app_store: "app_store", mac_app_store: "app_store", play_store: "google_play", promotional: "promotional",
};

/** Das Store-Abo, das „pro“ freischaltet; bevorzugt eines mit Zugang, sonst das zuletzt endende. Stripe läuft über den Stripe-Webhook. */
export function pickProSubscription(items: RevenueCatSubscription[]) {
  const pro = items.filter((item) =>
    STORE_PROVIDER[item.store ?? ""] && item.entitlements?.items?.some((entitlement) => entitlement.lookup_key === "pro"));
  const end = (item: RevenueCatSubscription) => item.ends_at ?? item.current_period_ends_at ?? Number.MAX_SAFE_INTEGER;
  return pro.sort((a, b) => Number(!!b.gives_access) - Number(!!a.gives_access) || end(b) - end(a))[0] ?? null;
}

/**
 * Abo-Stand für Convex. `storeProductId` ist die Store-Produkt-ID (v2 liefert in `product_id` nur die RevenueCat-ID);
 * ist sie unbekannt, gilt der bisherige Plan bzw. monatlich.
 */
export function mapRevenueCatSubscription(
  item: RevenueCatSubscription,
  products: RevenueCatProducts,
  storeProductId: string | undefined,
  fallbackPlan: BillingPlan = "pro_monthly",
): StoreEntitlement {
  const provider = STORE_PROVIDER[item.store ?? ""];
  if (!provider) throw new Error("UNSUPPORTED_REVENUECAT_STORE");
  const plan = storeProductId && products.yearly.has(storeProductId) ? "pro_yearly"
    : storeProductId && products.monthly.has(storeProductId) ? "pro_monthly"
      : fallbackPlan;
  let status: BillingStatus = "active";
  if (!item.gives_access) status = "expired";
  else if (item.status === "in_grace_period") status = "grace_period";
  else if (item.status === "in_billing_retry") status = "past_due";
  else if (item.auto_renewal_status === "will_not_renew" || item.auto_renewal_status === "will_pause") status = "canceled";
  return {
    provider,
    productId: storeProductId ?? item.product_id ?? "unknown",
    plan,
    status,
    periodEnd: item.ends_at ?? item.current_period_ends_at ?? undefined,
    willRenew: status === "active",
    environment: item.environment === "sandbox" ? "sandbox" : "production",
  };
}
