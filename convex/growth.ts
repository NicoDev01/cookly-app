import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { enqueueIntegration } from "./integrations";

const contactPayload = (user: {
  _id: unknown; billingUserId?: string; email?: string; name?: string;
  createdAt?: number; onboardingGoal?: string; subscription?: string;
  subscriptionStatus?: string; lifecycleStage?: string; lastActiveAt?: number;
  firstRecipeAt?: number; lastRecipeAt?: number; usageStats?: {
    linkImports?: number; photoScans?: number;
  };
}) => ({
  email: user.email,
  updateEnabled: true,
  attributes: {
    COOKLY_USER_ID: user.billingUserId ?? String(user._id),
    FIRSTNAME: user.name,
    CREATED_AT: user.createdAt ? new Date(user.createdAt).toISOString() : undefined,
    ONBOARDING_GOAL: user.onboardingGoal,
    PLAN: user.subscription ?? "free",
    SUBSCRIPTION_STATUS: user.subscriptionStatus ?? "active",
    LAST_ACTIVE_AT: user.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : undefined,
    FIRST_RECIPE_AT: user.firstRecipeAt ? new Date(user.firstRecipeAt).toISOString() : undefined,
    LAST_RECIPE_AT: user.lastRecipeAt ? new Date(user.lastRecipeAt).toISOString() : undefined,
    LINK_IMPORTS_USED: user.usageStats?.linkImports ?? 0,
    PHOTO_SCANS_USED: user.usageStats?.photoScans ?? 0,
    LIFECYCLE_STAGE: user.lifecycleStage ?? "registered",
  },
});

export const backfillUsers = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("users").paginate({ cursor: args.cursor ?? null, numItems: 50 });
    for (const user of page.page) {
      const first = await ctx.db.query("recipes").withIndex("by_user", (q) => q.eq("userId", user._id)).order("asc").first();
      const last = await ctx.db.query("recipes").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").first();
      const patch = {
        billingUserId: user.billingUserId ?? crypto.randomUUID(),
        firstSeenAt: user.firstSeenAt ?? user.createdAt ?? user._creationTime,
        lastActiveAt: user.lastActiveAt ?? user.updatedAt ?? user._creationTime,
        firstRecipeAt: user.firstRecipeAt ?? first?.createdAt,
        lastRecipeAt: user.lastRecipeAt ?? last?.updatedAt,
        lifecycleStage: user.lifecycleStage ?? (first ? "engaged" : user.onboardingCompleted ? "activated" : "registered"),
        updatedAt: Date.now(),
      };
      await ctx.db.patch(user._id, patch);
      if (user.email) await enqueueIntegration(ctx, "brevo", "contact", `backfill:${user._id}`, contactPayload({ ...user, ...patch }));
    }
    if (page.page.some((user) => user.email)) await ctx.scheduler.runAfter(0, internal.integrations.processJobs);
    return { cursor: page.continueCursor, done: page.isDone, processed: page.page.length };
  },
});

export const markDormantUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const threshold = Date.now() - 14 * 86_400_000;
    const users = await ctx.db.query("users").filter((q) =>
      q.and(q.lt(q.field("lastActiveAt"), threshold), q.neq(q.field("lifecycleStage"), "dormant"))
    ).take(100);
    for (const user of users) {
      await ctx.db.patch(user._id, { lifecycleStage: "dormant", updatedAt: Date.now() });
      if (user.email) {
        await enqueueIntegration(ctx, "brevo", "event", `dormant:${user._id}:${new Date().toISOString().slice(0, 10)}`, {
          event_name: "cookly_user_dormant",
          identifiers: { email_id: user.email },
          contact_properties: { COOKLY_USER_ID: user.billingUserId ?? String(user._id) },
        });
      }
    }
    if (users.length) await ctx.scheduler.runAfter(0, internal.integrations.processJobs);
    return users.length;
  },
});

export const recordStripeEvent = internalMutation({
  args: { eventId: v.string(), eventType: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const data = args.data as Record<string, unknown>;
    const customer = typeof data.customer === "string" ? data.customer : undefined;
    const user = customer
      ? await ctx.db.query("users").withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", customer)).first()
      : null;
    const clickedCampaign = user
      ? (await ctx.db.query("campaignDeliveries").withIndex("by_user", (q) => q.eq("userId", user._id)).take(100))
          .filter((item) => item.clickedAt && item.clickedAt > Date.now() - 30 * 86_400_000)
          .sort((a, b) => (b.clickedAt ?? 0) - (a.clickedAt ?? 0))[0]
      : undefined;
    if (args.eventType === "invoice.paid") {
      const existing = await ctx.db.query("revenueEvents").withIndex("by_externalId", (q) => q.eq("externalId", args.eventId)).unique();
      if (!existing) {
        const gross = Number(data.amount_paid ?? 0) / 100;
        await ctx.db.insert("revenueEvents", {
          externalId: args.eventId,
          userId: user?._id,
          type: "subscription",
          provider: "stripe",
          campaignId: clickedCampaign?.campaignId,
          productId: typeof data.subscription === "string" ? data.subscription : undefined,
          currency: String(data.currency ?? "eur").toUpperCase(),
          gross,
          fees: 0,
          net: gross,
          occurredAt: Number(data.created ?? Date.now() / 1_000) * 1_000,
        });
        if (clickedCampaign) await ctx.db.patch(clickedCampaign._id, { convertedAt: Date.now() });
      }
    }
    if (user?.email && ["invoice.paid", "invoice.payment_failed", "customer.subscription.deleted"].includes(args.eventType)) {
      const event = args.eventType === "invoice.paid"
        ? "cookly_subscription_started"
        : args.eventType === "invoice.payment_failed"
          ? "cookly_payment_failed"
          : "cookly_subscription_cancelled";
      await enqueueIntegration(ctx, "brevo", "event", `stripe:${args.eventId}:${event}`, {
        event_name: event,
        identifiers: { email_id: user.email },
        contact_properties: { COOKLY_USER_ID: user.billingUserId ?? String(user._id) },
      });
      await ctx.scheduler.runAfter(0, internal.integrations.processJobs);
    }
  },
});

export const recordRevenueCatEvent = internalMutation({
  args: { payload: v.any() },
  handler: async (ctx, args) => {
    const event = ((args.payload as { event?: unknown }).event ?? args.payload) as Record<string, unknown>;
    const id = String(event.id ?? "");
    if (!id) return;
    const existing = await ctx.db.query("revenueEvents").withIndex("by_externalId", (q) => q.eq("externalId", id)).unique();
    const billingUserId = typeof event.app_user_id === "string" ? event.app_user_id : undefined;
    const user = billingUserId
      ? await ctx.db.query("users").withIndex("by_billingUserId", (q) => q.eq("billingUserId", billingUserId)).first()
      : null;
    const clickedCampaign = user
      ? (await ctx.db.query("campaignDeliveries").withIndex("by_user", (q) => q.eq("userId", user._id)).take(100))
          .filter((item) => item.clickedAt && item.clickedAt > Date.now() - 30 * 86_400_000)
          .sort((a, b) => (b.clickedAt ?? 0) - (a.clickedAt ?? 0))[0]
      : undefined;
    const eventType = String(event.type ?? "");
    if (!existing && ["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE"].includes(eventType)) {
      const gross = Number(event.price_in_purchased_currency ?? event.price ?? 0);
      const commission = Number(event.commission_percentage ?? 0);
      const tax = Number(event.tax_percentage ?? 0);
      await ctx.db.insert("revenueEvents", {
        externalId: id,
        userId: user?._id,
        type: eventType === "NON_RENEWING_PURCHASE" ? "one_time" : "subscription",
        provider: "revenuecat",
        campaignId: clickedCampaign?.campaignId,
        productId: typeof event.product_id === "string" ? event.product_id : undefined,
        currency: String(event.currency ?? "EUR"),
        gross,
        fees: gross * commission,
        taxes: gross * tax,
        net: gross * (1 - commission - tax),
        occurredAt: Number(event.purchased_at_ms ?? Date.now()),
      });
      if (clickedCampaign) await ctx.db.patch(clickedCampaign._id, { convertedAt: Date.now() });
    }
  },
});
