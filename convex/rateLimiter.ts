import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 10,
  WINDOW_MS: 60 * 1000,
} as const;

export const checkAndConsumeRateLimit = internalMutation({
  args: {
    identifier: v.string(),
    bucket: v.union(
      v.literal("website"),
      v.literal("instagram"),
      v.literal("facebook"),
    ),
  },
  returns: v.object({
    allowed: v.boolean(),
    remaining: v.number(),
    resetAt: v.number(),
    limit: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const namespacedIdentifier = `api:${args.bucket}:${args.identifier}`;
    const row = await ctx.db
      .query("authRateLimits")
      .withIndex("identifier", (q) => q.eq("identifier", namespacedIdentifier))
      .first();

    if (!row || now - row.lastAttemptTime > RATE_LIMIT.WINDOW_MS) {
      if (row) {
        await ctx.db.patch(row._id, {
          lastAttemptTime: now,
          attemptsLeft: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE - 1,
        });
      } else {
        await ctx.db.insert("authRateLimits", {
          identifier: namespacedIdentifier,
          lastAttemptTime: now,
          attemptsLeft: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE - 1,
        });
      }

      return {
        allowed: true,
        remaining: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE - 1,
        resetAt: now + RATE_LIMIT.WINDOW_MS,
        limit: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE,
      };
    }

    if (row.attemptsLeft <= 0) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: row.lastAttemptTime + RATE_LIMIT.WINDOW_MS,
        limit: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE,
      };
    }

    await ctx.db.patch(row._id, {
      attemptsLeft: row.attemptsLeft - 1,
    });

    return {
      allowed: true,
      remaining: row.attemptsLeft - 1,
      resetAt: row.lastAttemptTime + RATE_LIMIT.WINDOW_MS,
      limit: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE,
    };
  },
});
