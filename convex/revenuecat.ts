import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { productIds, setProviderStatus, upsertEntitlement } from "./billing";
import { mapRevenueCatSubscription, pickProSubscription, type RevenueCatSubscription } from "./billingModel";

const STORE_PROVIDERS = ["app_store", "google_play", "promotional"] as const;

const storeEntitlement = v.object({
  provider: v.union(v.literal("app_store"), v.literal("google_play"), v.literal("promotional")),
  productId: v.string(),
  plan: v.union(v.literal("pro_monthly"), v.literal("pro_yearly")),
  status: v.union(v.literal("active"), v.literal("grace_period"), v.literal("past_due"), v.literal("canceled"), v.literal("expired")),
  periodEnd: v.optional(v.number()),
  willRenew: v.boolean(),
  environment: v.union(v.literal("sandbox"), v.literal("production")),
});

const API = "https://api.revenuecat.com/v2";
let cachedProjectId: string | undefined;

class RevenueCatError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`REVENUECAT_SYNC_FAILED_${status}: ${detail}`);
    this.status = status;
  }
}

async function rc<T>(path: string, key: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new RevenueCatError(response.status, (await response.text().catch(() => "")).slice(0, 300));
  return await response.json() as T;
}

/** Der Secret Key (API v2) gehört zu genau einem Projekt; REVENUECAT_PROJECT_ID überschreibt das. */
async function projectId(key: string) {
  if (process.env.REVENUECAT_PROJECT_ID) return process.env.REVENUECAT_PROJECT_ID;
  if (!cachedProjectId) {
    const { items } = await rc<{ items?: Array<{ id: string }> }>("/projects", key);
    if (!items?.[0]?.id) throw new Error("REVENUECAT_PROJECT_NOT_FOUND");
    cachedProjectId = items[0].id;
  }
  return cachedProjectId;
}

/** Holt den Abo-Stand bei RevenueCat (API v2) und schreibt ihn in Convex. `null`, wenn kein Secret Key gesetzt ist. */
async function syncCustomer(ctx: ActionCtx, billingUserId: string) {
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) {
    console.warn("REVENUECAT_SECRET_API_KEY fehlt, Store-Abgleich übersprungen");
    return null;
  }
  const project = await projectId(key);
  let items: RevenueCatSubscription[] = [];
  try {
    ({ items = [] } = await rc<{ items?: RevenueCatSubscription[] }>(
      `/projects/${project}/customers/${encodeURIComponent(billingUserId)}/subscriptions?limit=50`, key));
  } catch (error) {
    if (!(error instanceof RevenueCatError && error.status === 404)) throw error; // Kunde unbekannt: kein Abo
  }
  const subscription = pickProSubscription(items);
  let entitlement = null;
  if (subscription) {
    // v2 nennt in product_id die RevenueCat-ID; den Plan liefert die Store-Produkt-ID.
    const storeProductId = subscription.product_id
      ? await rc<{ store_identifier?: string }>(`/projects/${project}/products/${subscription.product_id}`, key)
        .then((product) => product.store_identifier)
        .catch(() => undefined)
      : undefined;
    entitlement = mapRevenueCatSubscription(subscription, {
      monthly: productIds("REVENUECAT_PRO_MONTHLY_PRODUCT_IDS"),
      yearly: productIds("REVENUECAT_PRO_YEARLY_PRODUCT_IDS"),
    }, storeProductId);
  }
  return await ctx.runMutation(internal.revenuecat.applyCustomer, { billingUserId, entitlement });
}

export const applyCustomer = internalMutation({
  args: { billingUserId: v.string(), entitlement: v.union(storeEntitlement, v.null()) },
  handler: async (ctx, { billingUserId, entitlement }) => {
    const user = await ctx.db.query("users")
      .withIndex("by_billingUserId", (q) => q.eq("billingUserId", billingUserId))
      .first();
    if (!user) return { isPro: false };

    if (entitlement) {
      await upsertEntitlement(ctx, { userId: user._id, externalCustomerId: billingUserId, ...entitlement });
    } else {
      // Kein Store-Pro mehr (abgelaufen oder per TRANSFER an ein anderes Konto gegangen).
      for (const provider of STORE_PROVIDERS) {
        const row = await ctx.db.query("billingEntitlements")
          .withIndex("by_user_provider", (q) => q.eq("userId", user._id).eq("provider", provider))
          .first();
        if (row && row.status !== "expired") await setProviderStatus(ctx, user._id, provider, "expired");
      }
    }
    const updated = await ctx.db.get(user._id);
    return { isPro: (updated?.subscription ?? "free") !== "free" };
  },
});

export const syncCustomerById = internalAction({
  args: { billingUserId: v.string() },
  handler: async (ctx, { billingUserId }) => {
    await syncCustomer(ctx, billingUserId);
  },
});

export const billingUserIdForAuth = internalQuery({
  args: { authUserId: v.string() },
  handler: async (ctx, { authUserId }) => {
    const user = await ctx.db.query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId))
      .first();
    return user?.billingUserId ?? null;
  },
});

/** Nach Kauf oder Wiederherstellen: sofort abgleichen statt auf den Webhook zu warten. */
export const syncMyStoreSubscription = action({
  args: {},
  handler: async (ctx): Promise<{ isPro: boolean } | null> => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("UNAUTHENTICATED");
    const billingUserId = await ctx.runQuery(internal.revenuecat.billingUserIdForAuth, { authUserId: authUserId.toString() });
    if (!billingUserId) return null;
    return await syncCustomer(ctx, billingUserId);
  },
});
