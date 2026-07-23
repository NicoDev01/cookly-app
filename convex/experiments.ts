import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

export const listAdmin = internalQuery({
  args: {},
  handler: (ctx) => ctx.db.query("experiments").order("desc").take(200),
});

export const createAdmin = internalMutation({
  args: {
    key: v.string(),
    posthogFlagId: v.optional(v.number()),
    name: v.string(),
    hypothesis: v.string(),
    variants: v.array(v.string()),
    audience: v.optional(v.any()),
    rollout: v.number(),
    primaryMetric: v.string(),
    guardrails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("experiments")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    return ctx.db.insert("experiments", {
      ...args,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setStatusAdmin = internalMutation({
  args: {
    id: v.id("experiments"),
    status: v.union(v.literal("draft"), v.literal("running"), v.literal("paused"), v.literal("completed")),
    winner: v.optional(v.string()),
    result: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.status,
      winner: args.winner,
      result: args.result,
      ...(args.status === "running" ? { startedAt: now } : {}),
      ...(args.status === "completed" ? { endedAt: now } : {}),
      updatedAt: now,
    });
  },
});
