import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 10,
  WINDOW_MS: 60 * 1000,
} as const;

export type RateLimitBucket = "website" | "instagram" | "facebook" | "photo" | "upload" | "ai_image";
export type ProviderBudget = "apify" | "jina" | "gemini" | "pollinations";

export async function consumeRateLimit(ctx: MutationCtx, userId: Id<"users">, bucket: RateLimitBucket) {
  const now = Date.now();
  const row = await ctx.db
    .query("apiRateLimits")
    .withIndex("by_user_bucket", (q) => q.eq("userId", userId).eq("bucket", bucket))
    .first();

  if (!row || now - row.windowStart >= RATE_LIMIT.WINDOW_MS) {
    if (row) {
      await ctx.db.patch(row._id, { windowStart: now, count: 1, updatedAt: now });
    } else {
      await ctx.db.insert("apiRateLimits", { userId, bucket, windowStart: now, count: 1, updatedAt: now });
    }
    return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE - 1, resetAt: now + RATE_LIMIT.WINDOW_MS, limit: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE };
  }

  if (row.count >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
    return { allowed: false, remaining: 0, resetAt: row.windowStart + RATE_LIMIT.WINDOW_MS, limit: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE };
  }

  await ctx.db.patch(row._id, { count: row.count + 1, updatedAt: now });
  return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE - row.count - 1, resetAt: row.windowStart + RATE_LIMIT.WINDOW_MS, limit: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE };
}

export async function consumeProviderBudget(ctx: MutationCtx, provider: ProviderBudget) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const configured = Number(process.env[`PROVIDER_DAILY_LIMIT_${provider.toUpperCase()}`] ?? 1000);
  const limit = Number.isFinite(configured) && configured > 0 ? configured : 1000;
  const row = await ctx.db.query("providerDailyUsage")
    .withIndex("by_provider_day", (q) => q.eq("provider", provider).eq("day", day))
    .first();
  if ((row?.count ?? 0) >= limit) return false;
  if (row) await ctx.db.patch(row._id, { count: row.count + 1, updatedAt: now });
  else await ctx.db.insert("providerDailyUsage", { provider, day, count: 1, updatedAt: now });
  return true;
}

export const checkAndConsumeRateLimit = internalMutation({
  args: {
    userId: v.id("users"),
    bucket: v.union(
      v.literal("website"),
      v.literal("instagram"),
      v.literal("facebook"),
      v.literal("photo"),
      v.literal("upload"),
      v.literal("ai_image"),
    ),
  },
  returns: v.object({
    allowed: v.boolean(),
    remaining: v.number(),
    resetAt: v.number(),
    limit: v.number(),
  }),
  handler: async (ctx, args) => {
    const linked = await ctx.db.query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.userId.toString()))
      .first();
    return consumeRateLimit(ctx, linked?._id ?? args.userId, args.bucket);
  },
});

export const checkAndConsumeProviderBudget = internalMutation({
  args: { provider: v.union(v.literal("apify"), v.literal("jina"), v.literal("gemini"), v.literal("pollinations")) },
  handler: (ctx, args) => consumeProviderBudget(ctx, args.provider),
});
