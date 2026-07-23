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
