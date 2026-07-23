import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  entitlementIsValid,
  hasAnyValidEntitlement,
  mapRevenueCatEvent,
  type BillingEnvironment,
  type BillingPlan,
  type BillingProvider,
  type BillingStatus,
} from "./billingModel";

type EntitlementInput = {
  userId: Id<"users">;
  provider: BillingProvider;
  externalCustomerId?: string;
  externalSubscriptionId?: string;
  productId: string;
  plan: BillingPlan;
  status: BillingStatus;
  periodEnd?: number;
  willRenew?: boolean;
  environment: BillingEnvironment;
  updatedAt?: number;
};

const productIds = (name: string) => new Set((process.env[name] ?? "").split(",").map((id) => id.trim()).filter(Boolean));

async function entitlementsForUser(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db.query("billingEntitlements")
    .withIndex("by_user_status", (q) => q.eq("userId", userId))
    .collect();
}

export async function hasProAccess(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const entitlements = await entitlementsForUser(ctx, userId);
  if (entitlements.length) return hasAnyValidEntitlement(entitlements);

  // Transitional fallback until the production Stripe backfill has completed.
  const user = await ctx.db.get(userId);
  return (user?.subscription ?? "free") !== "free";
}

async function syncLegacySubscription(ctx: MutationCtx, userId: Id<"users">) {
  const active = (await entitlementsForUser(ctx, userId))
    .filter((row) => entitlementIsValid(row.status, row.periodEnd));
  const plan = active.some((row) => row.plan === "pro_yearly") ? "pro_yearly" : active.length ? "pro_monthly" : "free";
  const periodEnds = active.flatMap((row) => row.periodEnd === undefined ? [] : [row.periodEnd]);

  await ctx.db.patch(userId, {
    subscription: plan,
    subscriptionStatus: active.length ? "active" : "canceled",
    subscriptionEnd: periodEnds.length ? Math.max(...periodEnds) : undefined,
    updatedAt: Date.now(),
  });
}

export async function upsertEntitlement(ctx: MutationCtx, input: EntitlementInput) {
  const existingBySubscription = input.externalSubscriptionId
    ? await ctx.db.query("billingEntitlements")
      .withIndex("by_externalSubscription", (q) => q.eq("externalSubscriptionId", input.externalSubscriptionId))
      .first()
    : null;
  const existing = existingBySubscription ?? await ctx.db.query("billingEntitlements")
    .withIndex("by_user_provider", (q) => q.eq("userId", input.userId).eq("provider", input.provider))
    .first();
  if (existingBySubscription && (existingBySubscription.userId !== input.userId || existingBySubscription.provider !== input.provider)) {
    throw new Error("ENTITLEMENT_OWNERSHIP_CONFLICT");
  }
  if (existing && input.updatedAt !== undefined && existing.updatedAt > input.updatedAt) return;
  const value = { ...input, updatedAt: input.updatedAt ?? Date.now() };

  if (existing) await ctx.db.patch(existing._id, value);
  else await ctx.db.insert("billingEntitlements", value);
  await syncLegacySubscription(ctx, input.userId);
}

export async function setProviderStatus(
  ctx: MutationCtx,
  userId: Id<"users">,
  provider: BillingProvider,
  status: BillingStatus,
) {
  const rows = await ctx.db.query("billingEntitlements")
    .withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider))
    .collect();
  for (const row of rows) await ctx.db.patch(row._id, { status, willRenew: false, updatedAt: Date.now() });
  await syncLegacySubscription(ctx, userId);
}

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return null;
    const user = await ctx.db.query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
      .first();
    if (!user) return null;
    const active = (await entitlementsForUser(ctx, user._id))
      .filter((row) => entitlementIsValid(row.status, row.periodEnd));
    const providers = [...new Set(active.map((row) => row.provider))];
    if (!providers.length && user.stripeCustomerId && user.subscription !== "free") providers.push("stripe");
    return { isPro: providers.length > 0, providers };
  },
});

export const processRevenueCatWebhook = internalMutation({
  args: { payload: v.any() },
  handler: async (ctx, { payload }) => {
    const mapped = mapRevenueCatEvent(payload?.event ?? {}, {
      monthly: productIds("REVENUECAT_PRO_MONTHLY_PRODUCT_IDS"),
      yearly: productIds("REVENUECAT_PRO_YEARLY_PRODUCT_IDS"),
    });
    const processed = await ctx.db.query("revenueCatWebhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", mapped.eventId))
      .first();
    if (processed) return { duplicate: true, ignored: false };

    if (mapped.ignored) {
      await ctx.db.insert("revenueCatWebhookEvents", {
        eventId: mapped.eventId,
        eventType: mapped.eventType,
        processedAt: Date.now(),
      });
      return { duplicate: false, ignored: true };
    }

    let user = null;
    for (const billingUserId of mapped.billingUserIds) {
      user = await ctx.db.query("users")
        .withIndex("by_billingUserId", (q) => q.eq("billingUserId", billingUserId))
        .first();
      if (user) break;
    }
    if (!user?.billingUserId) throw new Error("REVENUECAT_USER_NOT_FOUND");

    await upsertEntitlement(ctx, {
      userId: user._id,
      provider: mapped.provider,
      externalCustomerId: user.billingUserId,
      externalSubscriptionId: mapped.externalSubscriptionId,
      productId: mapped.productId,
      plan: mapped.plan,
      status: mapped.status,
      periodEnd: mapped.periodEnd,
      willRenew: mapped.willRenew,
      environment: mapped.environment,
      updatedAt: mapped.eventTimestamp,
    });
    await ctx.db.insert("revenueCatWebhookEvents", {
      eventId: mapped.eventId,
      eventType: mapped.eventType,
      billingUserId: user.billingUserId,
      processedAt: Date.now(),
    });
    return { duplicate: false, ignored: false };
  },
});

export const backfillBillingUsers = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db.query("users").paginate(paginationOpts);
    for (const user of result.page) {
      const billingUserId = user.billingUserId ?? crypto.randomUUID();
      if (!user.billingUserId) await ctx.db.patch(user._id, { billingUserId, updatedAt: Date.now() });
      if ((user.subscription ?? "free") === "free" || !user.stripeCustomerId) continue;

      await upsertEntitlement(ctx, {
        userId: user._id,
        provider: "stripe",
        externalCustomerId: user.stripeCustomerId,
        externalSubscriptionId: user.stripeSubscriptionId,
        productId: user.subscription ?? "pro_monthly",
        plan: user.subscription === "pro_yearly" ? "pro_yearly" : "pro_monthly",
        status: user.subscriptionStatus === "past_due" ? "past_due" : user.subscriptionStatus === "canceled" ? "canceled" : "active",
        periodEnd: user.subscriptionEnd ?? user.usageStats?.subscriptionEndDate,
        willRenew: !user.usageStats?.resetOnDowngrade,
        environment: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "production" : "sandbox",
      });
    }
    return { continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

export const cleanupWebhookEvents = internalMutation({
  args: { olderThanMs: v.number() },
  handler: async (ctx, { olderThanMs }) => {
    const rows = await ctx.db.query("revenueCatWebhookEvents")
      .withIndex("by_processedAt", (q) => q.lt("processedAt", olderThanMs))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
