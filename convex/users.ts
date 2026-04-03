import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { FREE_LIMITS } from "./constants";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// ============================================================
// HELPER
// ============================================================

/**
 * Gibt den aktuell eingeloggten User aus der custom users-Tabelle zurück.
 * Nutzt Convex Auth statt Clerk identity.
 */
async function getCurrentUserFromCtx(ctx: QueryCtx | MutationCtx) {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
    .first();
}

// ============================================================
// PUBLIC QUERIES
// ============================================================

/**
 * Get current authenticated user
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUserFromCtx(ctx);
  },
});

/**
 * Prüft ob User ein manuelles Rezept erstellen kann
 */
export const canCreateManualRecipe = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) return { canProceed: false, error: "NOT_AUTHENTICATED" };

    if (user.subscription !== "free") {
      return { canProceed: true, isPro: true, subscription: user.subscription };
    }

    const current = user.usageStats?.manualRecipes || 0;
    const limit = FREE_LIMITS.MANUAL_RECIPES;
    return {
      canProceed: current < limit,
      isPro: false,
      subscription: "free" as const,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      feature: "manual_recipes" as const,
    };
  },
});

/**
 * Prüft ob User einen Link Import machen kann
 */
export const canImportFromLink = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) return { canProceed: false, error: "NOT_AUTHENTICATED" };

    if (user.subscription !== "free") {
      return { canProceed: true, isPro: true, subscription: user.subscription };
    }

    const current = user.usageStats?.linkImports || 0;
    const limit = FREE_LIMITS.LINK_IMPORTS;
    return {
      canProceed: current < limit,
      isPro: false,
      subscription: "free" as const,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      feature: "link_imports" as const,
    };
  },
});

/**
 * Prüft ob User ein Foto scannen kann
 */
export const canScanPhoto = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) return { canProceed: false, error: "NOT_AUTHENTICATED" };

    if (user.subscription !== "free") {
      return { canProceed: true, isPro: true, subscription: user.subscription };
    }

    const current = user.usageStats?.photoScans || 0;
    const limit = FREE_LIMITS.PHOTO_SCANS;
    return {
      canProceed: current < limit,
      isPro: false,
      subscription: "free" as const,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      feature: "photo_scans" as const,
    };
  },
});

/**
 * Get usage stats (für ProfilePage)
 */
export const getUsageStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) return null;

    const isPro = user.subscription !== "free";
    return {
      usage: user.usageStats,
      isPro,
      limits: {
        recipes: FREE_LIMITS.MANUAL_RECIPES,
        imports: FREE_LIMITS.LINK_IMPORTS,
        scans: FREE_LIMITS.PHOTO_SCANS,
      },
    };
  },
});

// ============================================================
// PUBLIC MUTATIONS
// ============================================================

/**
 * Erstellt den User-Datensatz nach erfolgreichem Login/Signup.
 * Wird aus ProtectedLayout aufgerufen wenn currentUser null ist.
 * Ersetzt syncUserIfNotExists + createOrUpdateUserFromWebhook.
 */
export const createOrSyncUser = mutation({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");

    // Existiert bereits → nichts tun
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
      .first();

    if (existing) return existing._id;

    // Profildaten aus Convex Auth Identity
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email ?? undefined;
    const name = identity?.name ?? email?.split("@")[0] ?? "User";
    const avatar = identity?.pictureUrl ?? undefined;

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      authUserId: authUserId.toString(),
      email,
      name,
      avatar,
      subscription: "free",
      subscriptionStatus: "active",
      onboardingCompleted: false,
      notificationsEnabled: false,
      usageStats: {
        manualRecipes: 0,
        linkImports: 0,
        photoScans: 0,
        subscriptionStartDate: undefined,
        subscriptionEndDate: undefined,
        resetOnDowngrade: false,
      },
      createdAt: now,
      updatedAt: now,
    });

    console.log(`[UserSync] ✅ Created user ${authUserId} in Convex`);
    return userId;
  },
});

/**
 * Update onboarding data
 */
export const updateOnboarding = mutation({
  args: {
    name: v.optional(v.string()),
    cookingFrequency: v.optional(v.string()),
    preferredCuisines: v.optional(v.array(v.string())),
    notificationsEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) throw new Error("Not authenticated");

    await ctx.db.patch(user._id, {
      name: args.name ?? user.name,
      cookingFrequency: args.cookingFrequency ?? user.cookingFrequency,
      preferredCuisines: args.preferredCuisines ?? user.preferredCuisines,
      notificationsEnabled: args.notificationsEnabled,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Complete onboarding
 */
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) throw new Error("Not authenticated");

    await ctx.db.patch(user._id, {
      onboardingCompleted: true,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update subscription (called from authenticated user context)
 */
export const updateSubscription = mutation({
  args: {
    subscription: v.union(
      v.literal("free"),
      v.literal("pro_monthly"),
      v.literal("pro_yearly")
    ),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due")
    ),
    subscriptionEndDate: v.optional(v.number()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) throw new Error("Not authenticated");

    await ctx.db.patch(user._id, {
      subscription: args.subscription,
      subscriptionStatus: args.subscriptionStatus,
      usageStats: {
        ...user.usageStats,
        subscriptionEndDate: args.subscriptionEndDate,
      },
      stripeCustomerId: args.stripeCustomerId ?? user.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId ?? user.stripeSubscriptionId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete user account (GDPR compliant)
 * Called when user deletes their own account
 */
export const deleteCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) throw new Error("Not authenticated");

    // Delete all user's recipes
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const recipe of recipes) {
      await ctx.db.delete(recipe._id);
    }

    // Delete all user's weekly meals
    const weeklyMeals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id))
      .collect();
    for (const meal of weeklyMeals) {
      await ctx.db.delete(meal._id);
    }

    // Delete all user's shopping items
    const shoppingItems = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const item of shoppingItems) {
      await ctx.db.delete(item._id);
    }

    // Delete categories and stats
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const cat of categories) {
      await ctx.db.delete(cat._id);
    }

    const categoryStats = await ctx.db
      .query("categoryStats")
      .withIndex("by_user_category", (q) => q.eq("userId", user._id))
      .collect();
    for (const stat of categoryStats) {
      await ctx.db.delete(stat._id);
    }

    await ctx.db.delete(user._id);

    console.log(`[DeleteUser] ✅ User ${user._id} and all data deleted`);
    return { success: true };
  },
});

// ============================================================
// INTERNAL MUTATIONS
// ============================================================

/**
 * Erhöht den entsprechenden Usage Counter nach erfolgreichem Insert.
 * Wird von recipes.ts etc. aufgerufen.
 */
export const incrementUsageCounter = internalMutation({
  args: {
    userId: v.id("users"),
    feature: v.union(
      v.literal("manual_recipes"),
      v.literal("link_imports"),
      v.literal("photo_scans")
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Pro User brauchen keine Counter
    if (user.subscription !== "free") return;

    const currentStats = user.usageStats || {
      manualRecipes: 0,
      linkImports: 0,
      photoScans: 0,
      subscriptionStartDate: undefined,
      subscriptionEndDate: undefined,
      resetOnDowngrade: false,
    };

    const updates: Record<string, unknown> = {};
    switch (args.feature) {
      case "manual_recipes":
        updates.usageStats = { ...currentStats, manualRecipes: (currentStats.manualRecipes || 0) + 1 };
        break;
      case "link_imports":
        updates.usageStats = { ...currentStats, linkImports: (currentStats.linkImports || 0) + 1 };
        break;
      case "photo_scans":
        updates.usageStats = { ...currentStats, photoScans: (currentStats.photoScans || 0) + 1 };
        break;
    }

    await ctx.db.patch(user._id, { ...updates, updatedAt: Date.now() });
  },
});

/**
 * Setzt alle Counter auf 0 (bei Downgrade Pro→Free)
 */
export const resetUsageCounters = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;

    await ctx.db.patch(user._id, {
      usageStats: {
        manualRecipes: 0,
        linkImports: 0,
        photoScans: 0,
        subscriptionStartDate: undefined,
        subscriptionEndDate: undefined,
        resetOnDowngrade: false,
      },
      updatedAt: Date.now(),
    });
    console.log(`[Reset] Usage counters reset for user ${args.userId}`);
  },
});

/**
 * Markiert User für Downgrade (bei Kündigung)
 */
export const markForDowngrade = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      usageStats: { ...user.usageStats, resetOnDowngrade: true },
      updatedAt: Date.now(),
    });
    console.log(`[Downgrade] User ${args.userId} marked for counter reset`);
  },
});

/**
 * Markiert User für Downgrade via Stripe Customer ID
 */
export const markForDowngradeByStripeCustomer = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    subscriptionEndDate: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();

    if (!user) {
      console.error(`User with stripeCustomerId ${args.stripeCustomerId} not found`);
      return;
    }

    await ctx.db.patch(user._id, {
      usageStats: {
        ...user.usageStats,
        subscriptionEndDate: args.subscriptionEndDate,
        resetOnDowngrade: true,
      },
      updatedAt: Date.now(),
    });
    console.log(`[Downgrade] Customer ${args.stripeCustomerId} marked for reset at ${new Date(args.subscriptionEndDate).toISOString()}`);
  },
});

/**
 * Update Subscription via Convex User ID (für Stripe Webhooks)
 * Ersetzt updateSubscriptionByClerkId
 */
export const updateSubscriptionByConvexUserId = internalMutation({
  args: {
    convexUserId: v.string(),
    subscription: v.union(
      v.literal("free"),
      v.literal("pro_monthly"),
      v.literal("pro_yearly")
    ),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due")
    ),
    subscriptionStartDate: v.optional(v.number()),
    subscriptionEndDate: v.optional(v.number()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.convexUserId as any);
    if (!user) throw new Error(`User ${args.convexUserId} not found`);

    await ctx.db.patch(user._id, {
      subscription: args.subscription,
      subscriptionStatus: args.subscriptionStatus,
      usageStats: {
        ...user.usageStats,
        subscriptionStartDate: args.subscriptionStartDate,
        subscriptionEndDate: args.subscriptionEndDate,
      },
      stripeCustomerId: args.stripeCustomerId ?? user.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId ?? user.stripeSubscriptionId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update Subscription via Stripe Customer ID (für Stripe Webhooks)
 */
export const updateSubscriptionByStripeCustomer = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    subscription: v.optional(v.union(
      v.literal("free"),
      v.literal("pro_monthly"),
      v.literal("pro_yearly")
    )),
    subscriptionStatus: v.optional(v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due")
    )),
    subscriptionEndDate: v.optional(v.number()),
    subscriptionStartDate: v.optional(v.number()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();

    if (!user) {
      console.error(`User with stripeCustomerId ${args.stripeCustomerId} not found`);
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.subscription !== undefined) updates.subscription = args.subscription;
    if (args.subscriptionStatus !== undefined) updates.subscriptionStatus = args.subscriptionStatus;
    if (args.subscriptionEndDate !== undefined || args.subscriptionStartDate !== undefined) {
      updates.usageStats = {
        ...user.usageStats,
        subscriptionEndDate: args.subscriptionEndDate,
        subscriptionStartDate: args.subscriptionStartDate,
      };
    }
    if (args.stripeSubscriptionId !== undefined) {
      updates.stripeSubscriptionId = args.stripeSubscriptionId;
    }

    await ctx.db.patch(user._id, updates);
  },
});

/**
 * Update nur den Subscription Status (für payment_failed etc.)
 */
export const updateSubscriptionStatusByStripeCustomer = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due")
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();

    if (!user) {
      console.error(`User with stripeCustomerId ${args.stripeCustomerId} not found`);
      return;
    }

    await ctx.db.patch(user._id, {
      subscriptionStatus: args.subscriptionStatus,
      updatedAt: Date.now(),
    });
  },
});
