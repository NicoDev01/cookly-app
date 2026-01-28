import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// INTERNAL QUERIES
// ============================================================

/**
 * Get User by Clerk ID
 * HINWEIS: Die meisten Internal Mutations sind jetzt in users.ts
 */
export const getUserByClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

/**
 * Get User by Stripe Customer ID
 */
export const getUserByStripeCustomerId = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();
  },
});

/**
 * Get All Pro Users (für Subscription Status Sync)
 */
export const getAllProUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.neq(q.field("subscription"), "free"))
      .collect();
  },
});

// ============================================================
// INTERNAL MUTATIONS
// ============================================================
// HINWEIS: Die meisten Internal Mutations für Subscription Management
// sind jetzt in users.ts:
// - updateSubscriptionByClerkId
// - updateSubscriptionByStripeCustomer
// - updateSubscriptionStatusByStripeCustomer
// - markForDowngrade
// - markForDowngradeByStripeCustomer
// - resetUsageCounters
//
// Diese Datei dient nur noch als Kompatibilitätslayer für alte Importe.
