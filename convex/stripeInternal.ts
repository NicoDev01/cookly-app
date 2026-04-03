import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getUserByAuthUserId = internalQuery({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
  },
});

export const getUserByStripeCustomerId = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();
  },
});

export const getAllProUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.neq(q.field("subscription"), "free"))
      .collect();
  },
});
