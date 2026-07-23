import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_RETENTION_MS = 45 * 24 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 50;

export const requestDeletion = action({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }): Promise<{ status: "completed" }> => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("NOT_AUTHENTICATED");

    return await ctx.runAction(internal.accountDeletion.requestDeletionForAuth, {
      authUserId: authUserId.toString(),
      requestId,
    });
  },
});

export const requestDeletionForAuth = internalAction({
  args: { authUserId: v.string(), requestId: v.string() },
  handler: async (ctx, { authUserId, requestId }): Promise<{ status: "completed" }> => {
    const request = await ctx.runMutation(internal.accountDeletion.reserve, {
      authUserId,
      requestId,
    });
    if (request.status === "completed") return { status: "completed" };

    await ctx.runMutation(internal.accountDeletion.setStatus, {
      userId: request.userId,
      requestId,
      status: "billing_cleanup",
    });

    try {
      if (request.stripeCustomerId) {
        await ctx.runAction(internal.stripe.deleteCustomer, {
          stripeCustomerId: request.stripeCustomerId,
        });
      }
    } catch {
      await ctx.runMutation(internal.accountDeletion.fail, {
        userId: request.userId,
        requestId,
        errorCode: "BILLING_CLEANUP_FAILED",
      });
      throw new Error("ACCOUNT_DELETION_FAILED");
    }

    await ctx.runMutation(internal.accountDeletion.setStatus, {
      userId: request.userId,
      requestId,
      status: "local_cleanup",
    });

    try {
      let done = false;
      while (!done) {
        ({ done } = await ctx.runMutation(internal.accountDeletion.deleteLocalData, {
          authUserId,
          userId: request.userId,
          requestId,
        }));
      }
      return { status: "completed" };
    } catch {
      await ctx.runMutation(internal.accountDeletion.fail, {
        userId: request.userId,
        requestId,
        errorCode: "LOCAL_CLEANUP_FAILED",
      });
      throw new Error("ACCOUNT_DELETION_FAILED");
    }
  },
});

export const reserve = internalMutation({
  args: { authUserId: v.string(), requestId: v.string() },
  handler: async (ctx, args) => {
    if (!REQUEST_ID.test(args.requestId)) throw new Error("INVALID_REQUEST_ID");

    const linkedUser = await ctx.db.query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
    const user = linkedUser ?? await ctx.db.get(args.authUserId as Id<"users">);
    if (!user) throw new Error("NOT_AUTHENTICATED");

    const existing = await ctx.db.query("accountDeletionRequests")
      .withIndex("by_user_request", (q) => q.eq("userId", user._id).eq("requestId", args.requestId))
      .unique();
    if (existing) return existing;

    for (const status of ["requested", "billing_cleanup", "local_cleanup"] as const) {
      const active = await ctx.db.query("accountDeletionRequests")
        .withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", status))
        .first();
      if (active) throw new Error("DELETION_ALREADY_PENDING");
    }

    const now = Date.now();
    const id = await ctx.db.insert("accountDeletionRequests", {
      userId: user._id,
      requestId: args.requestId,
      status: "requested",
      stripeCustomerId: user.stripeCustomerId,
      createdAt: now,
      updatedAt: now,
    });
    return (await ctx.db.get(id))!;
  },
});

export const setStatus = internalMutation({
  args: {
    userId: v.id("users"),
    requestId: v.string(),
    status: v.union(v.literal("billing_cleanup"), v.literal("local_cleanup")),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.query("accountDeletionRequests")
      .withIndex("by_user_request", (q) => q.eq("userId", args.userId).eq("requestId", args.requestId))
      .unique();
    if (!request) throw new Error("DELETION_REQUEST_NOT_FOUND");
    if (request.status === "completed") return;
    if (args.status === "billing_cleanup" && request.status === "local_cleanup") return;
    await ctx.db.patch(request._id, { status: args.status, lastErrorCode: undefined, updatedAt: Date.now() });
  },
});

export const fail = internalMutation({
  args: { userId: v.id("users"), requestId: v.string(), errorCode: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db.query("accountDeletionRequests")
      .withIndex("by_user_request", (q) => q.eq("userId", args.userId).eq("requestId", args.requestId))
      .unique();
    const expectedStatus = args.errorCode === "BILLING_CLEANUP_FAILED" ? "billing_cleanup" : "local_cleanup";
    if (request?.status === expectedStatus) {
      await ctx.db.patch(request._id, { status: "failed", lastErrorCode: args.errorCode, updatedAt: Date.now() });
    }
  },
});

export const deleteLocalData = internalMutation({
  args: { authUserId: v.string(), userId: v.id("users"), requestId: v.string() },
  handler: async (ctx, args): Promise<{ done: boolean }> => {
    const request = await ctx.db.query("accountDeletionRequests")
      .withIndex("by_user_request", (q) => q.eq("userId", args.userId).eq("requestId", args.requestId))
      .unique();
    if (!request) throw new Error("DELETION_REQUEST_NOT_FOUND");
    if (request.status === "completed") return { done: true };
    if (request.status !== "local_cleanup") throw new Error("BILLING_CLEANUP_REQUIRED");

    const authUser = await ctx.db.get(args.authUserId as Id<"users">);
    const userIds = [...new Set([args.userId, authUser?._id].filter(Boolean) as Id<"users">[])];
    const identifiers = new Set([args.authUserId]);
    const profile = await ctx.db.get(args.userId);
    if (profile?.email) identifiers.add(profile.email);
    if (authUser?.email) identifiers.add(authUser.email);

    for (const billingUserId of new Set([profile?.billingUserId, authUser?.billingUserId].filter(Boolean) as string[])) {
      const rows = await ctx.db.query("revenueCatWebhookEvents")
        .withIndex("by_billingUserId", (q) => q.eq("billingUserId", billingUserId))
        .take(DELETE_BATCH_SIZE);
      if (rows.length) {
        for (const row of rows) await ctx.db.delete(row._id);
        return { done: false };
      }
    }

    for (const userId of userIds) {
      const loadBatches = [
        () => ctx.db.query("analyticsEvents").withIndex("by_user_occurredAt", (q) => q.eq("userId", userId)).take(DELETE_BATCH_SIZE),
        () => ctx.db.query("campaignDeliveries").withIndex("by_user", (q) => q.eq("userId", userId)).take(DELETE_BATCH_SIZE),
        () => ctx.db.query("pushDevices").withIndex("by_user_enabled", (q) => q.eq("userId", userId)).take(DELETE_BATCH_SIZE),
        () => ctx.db.query("revenueEvents").withIndex("by_user_occurredAt", (q) => q.eq("userId", userId)).take(DELETE_BATCH_SIZE),
        () => ctx.db.query("billingEntitlements").withIndex("by_user_status", (q) => q.eq("userId", userId)).take(DELETE_BATCH_SIZE),
        () => ctx.db.query("weeklyMeals").withIndex("by_user_date", (q) => q.eq("userId", userId)).take(DELETE_BATCH_SIZE),
        () => ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", userId)).take(DELETE_BATCH_SIZE),
        () => ctx.db.query("categoryStats").withIndex("by_user_category", (q) => q.eq("userId", userId)).take(DELETE_BATCH_SIZE),
        () => ctx.db.query("importOperations").withIndex("by_user_operation", (q) => q.eq("userId", userId)).take(DELETE_BATCH_SIZE),
      ];
      for (const loadBatch of loadBatches) {
        const rows = await loadBatch();
        if (rows.length) {
          for (const row of rows) await ctx.db.delete(row._id);
          return { done: false };
        }
      }

      const recipes = await ctx.db.query("recipes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(DELETE_BATCH_SIZE);
      for (const recipe of recipes) {
        if (recipe.imageStorageId) try { await ctx.storage.delete(recipe.imageStorageId); } catch { /* already gone */ }
        await ctx.db.delete(recipe._id);
      }
      if (recipes.length) return { done: false };

      const categories = await ctx.db.query("categories")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(DELETE_BATCH_SIZE);
      for (const category of categories) {
        if (category.imageStorageId) try { await ctx.storage.delete(category.imageStorageId); } catch { /* already gone */ }
        await ctx.db.delete(category._id);
      }
      if (categories.length) return { done: false };

      for (const state of ["pending", "claimed", "released"] as const) {
        const assets = await ctx.db.query("storageAssets")
          .withIndex("by_user_state", (q) => q.eq("userId", userId).eq("state", state))
          .take(DELETE_BATCH_SIZE);
        if (assets.length) {
          for (const asset of assets) {
            try { await ctx.storage.delete(asset.storageId); } catch { /* already gone */ }
            await ctx.db.delete(asset._id);
          }
          return { done: false };
        }
      }

      const session = await ctx.db.query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .first();
      if (session) {
        const tokens = await ctx.db.query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .take(DELETE_BATCH_SIZE);
        if (tokens.length) {
          for (const token of tokens) await ctx.db.delete(token._id);
          return { done: false };
        }
        const verifiers = await ctx.db.query("authVerifiers")
          .filter((q) => q.eq(q.field("sessionId"), session._id))
          .take(DELETE_BATCH_SIZE);
        if (verifiers.length) {
          for (const verifier of verifiers) await ctx.db.delete(verifier._id);
          return { done: false };
        }
        await ctx.db.delete(session._id);
        return { done: false };
      }

      const account = await ctx.db.query("authAccounts")
        .filter((q) => q.eq(q.field("userId"), userId))
        .first();
      if (account) {
        const codes = await ctx.db.query("authVerificationCodes")
          .withIndex("accountId", (q) => q.eq("accountId", account._id))
          .take(DELETE_BATCH_SIZE);
        if (codes.length) {
          for (const code of codes) await ctx.db.delete(code._id);
          return { done: false };
        }
        await ctx.db.delete(account._id);
        return { done: false };
      }
    }

    for (const identifier of identifiers) {
      const rows = await ctx.db.query("authRateLimits")
        .withIndex("identifier", (q) => q.eq("identifier", identifier))
        .take(DELETE_BATCH_SIZE);
      if (rows.length) {
        for (const row of rows) await ctx.db.delete(row._id);
        return { done: false };
      }
    }
    for (const userId of userIds) {
      if (await ctx.db.get(userId)) {
        await ctx.db.delete(userId);
        return { done: false };
      }
    }

    const others = await ctx.db.query("accountDeletionRequests")
      .withIndex("by_user_request", (q) => q.eq("userId", args.userId))
      .take(DELETE_BATCH_SIZE + 1);
    const stale = others.filter((other) => other._id !== request._id).slice(0, DELETE_BATCH_SIZE);
    if (stale.length) {
      for (const other of stale) await ctx.db.delete(other._id);
      return { done: false };
    }

    await ctx.db.patch(request._id, {
      status: "completed",
      lastErrorCode: undefined,
      updatedAt: Date.now(),
      completedAt: Date.now(),
    });
    return { done: true };
  },
});

export const isStripeCustomerDeleting = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db.query("accountDeletionRequests")
      .withIndex("by_stripe_customer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .order("desc")
      .first();
    return !!request && ["billing_cleanup", "local_cleanup", "completed"].includes(request.status);
  },
});

export const cleanupCompleted = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db.query("accountDeletionRequests")
      .withIndex("by_status_updatedAt", (q) => q.eq("status", "completed").lt("updatedAt", Date.now() - TERMINAL_RETENTION_MS))
      .take(100);
    for (const request of expired) await ctx.db.delete(request._id);
    return expired.length;
  },
});

export const cleanupOrphanedAuthUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    if (await ctx.db.get(userId)) throw new Error("USER_STILL_EXISTS");

    let accounts = 0;
    for (const account of await ctx.db.query("authAccounts").filter((q) => q.eq(q.field("userId"), userId)).collect()) {
      for (const code of await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", account._id)).collect()) {
        await ctx.db.delete(code._id);
      }
      await ctx.db.delete(account._id);
      accounts++;
    }

    let sessions = 0;
    for (const session of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect()) {
      for (const token of await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session._id)).collect()) {
        await ctx.db.delete(token._id);
      }
      for (const verifier of await ctx.db.query("authVerifiers").filter((q) => q.eq(q.field("sessionId"), session._id)).collect()) {
        await ctx.db.delete(verifier._id);
      }
      await ctx.db.delete(session._id);
      sessions++;
    }

    return { accounts, sessions };
  },
});
