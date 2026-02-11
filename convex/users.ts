import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// LIMITS DEFINITION
// ============================================================
const FREE_LIMITS = {
  MANUAL_RECIPES: 100,    // ANPASSUNG HIER: Manuell erstellte Rezepte Limit
  LINK_IMPORTS: 100,      // ANPASSUNG HIER: URL/Instagram Imports Limit
  PHOTO_SCANS: 100,       // ANPASSUNG HIER: KI Foto-Scans Limit
};

// ============================================================
// PUBLIC QUERIES
// ============================================================

/**
 * Get current authenticated user
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    return user;
  },
});

/**
 * Prüft ob User ein manuelles Rezept erstellen kann
 * Wird proaktiv vom Frontend aufgerufen
 */
export const canCreateManualRecipe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { canProceed: false, error: "NOT_AUTHENTICATED" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return { canProceed: false, error: "NOT_AUTHENTICATED" };
    }

    // Pro User haben keine Limits
    if (user.subscription !== "free") {
      return {
        canProceed: true,
        isPro: true,
        subscription: user.subscription,
      };
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
 * Wird proaktiv vom Frontend aufgerufen
 */
export const canImportFromLink = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { canProceed: false, error: "NOT_AUTHENTICATED" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return { canProceed: false, error: "NOT_AUTHENTICATED" };
    }

    // Pro User haben keine Limits
    if (user.subscription !== "free") {
      return {
        canProceed: true,
        isPro: true,
        subscription: user.subscription,
      };
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
 * Wird proaktiv vom Frontend aufgerufen
 */
export const canScanPhoto = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { canProceed: false, error: "NOT_AUTHENTICATED" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return { canProceed: false, error: "NOT_AUTHENTICATED" };
    }

    // Pro User haben keine Limits
    if (user.subscription !== "free") {
      return {
        canProceed: true,
        isPro: true,
        subscription: user.subscription,
      };
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
 * Legacy - Get usage stats (für ProfilePage Kompatibilität)
 */
export const getUsageStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

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
 * Create or update user (called from Clerk webhook)
 */
export const createOrUpdateUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    const now = Date.now();

    if (existingUser) {
      // Update existing user (nur Profil-Daten, Usage Stats bleiben!)
      await ctx.db.patch(existingUser._id, {
        email: args.email ?? existingUser.email,
        name: args.name ?? existingUser.name,
        avatar: args.avatar ?? existingUser.avatar,
        updatedAt: now,
      });
      return existingUser._id;
    } else {
      // Create new user mit neuen usageStats
      const userId = await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        name: args.name,
        avatar: args.avatar,
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
      return userId;
    }
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      onboardingCompleted: true,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update subscription (called from Stripe webhook)
 * HINWEIS: subscriptionStatus hat kein "trialing" mehr
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

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
 * Called from Clerk webhook when user is deleted
 */
export const deleteUser = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      console.log(`User ${args.clerkId} not found in Convex, already deleted`);
      return { success: true, message: "User not found" };
    }

    // Delete all user's recipes
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", args.clerkId))
      .collect();

    for (const recipe of recipes) {
      await ctx.db.delete(recipe._id);
    }

    // Delete all user's weekly meals
    const weeklyMeals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("clerkId", args.clerkId))
      .collect();

    for (const meal of weeklyMeals) {
      await ctx.db.delete(meal._id);
    }

    // Delete all user's shopping items
    const shoppingItems = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("clerkId", args.clerkId))
      .collect();

    for (const item of shoppingItems) {
      await ctx.db.delete(item._id);
    }

    // Finally delete the user record
    await ctx.db.delete(user._id);

    console.log(`User ${args.clerkId} and all associated data deleted from Convex`);
    return {
      success: true,
      deletedRecipes: recipes.length,
      deletedWeeklyMeals: weeklyMeals.length,
      deletedShoppingItems: shoppingItems.length,
    };
  },
});

// ============================================================
// INTERNAL MUTATIONS
// ============================================================

/**
 * Erhöht den entsprechenden Counter nach erfolgreichem Insert
 * WIRD NUR AUFGERUFEN NACHDEM DAS REZEPT ERFOLGREICH ERSTELLT WURDE
 */
export const incrementUsageCounter = internalMutation({
  args: {
    clerkId: v.string(),
    feature: v.union(
      v.literal("manual_recipes"),
      v.literal("link_imports"),
      v.literal("photo_scans")
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Pro User brauchen keine Counter
    if (user.subscription !== "free") {
      return;
    }

    const updates: Record<string, unknown> = {};
    const currentStats = user.usageStats || {
      manualRecipes: 0,
      linkImports: 0,
      photoScans: 0,
      subscriptionStartDate: undefined,
      subscriptionEndDate: undefined,
      resetOnDowngrade: false,
    };

    switch (args.feature) {
      case "manual_recipes":
        updates.usageStats = {
          ...currentStats,
          manualRecipes: (currentStats.manualRecipes || 0) + 1,
        };
        break;
      case "link_imports":
        updates.usageStats = {
          ...currentStats,
          linkImports: (currentStats.linkImports || 0) + 1,
        };
        break;
      case "photo_scans":
        updates.usageStats = {
          ...currentStats,
          photoScans: (currentStats.photoScans || 0) + 1,
        };
        break;
    }

    await ctx.db.patch(user._id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Setzt alle Counter auf 0 (wird bei Downgrade Pro→Free aufgerufen)
 * Rezepte bleiben erhalten!
 */
export const resetUsageCounters = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

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

    console.log(`[Reset] Usage counters reset for user ${args.clerkId}`);
  },
});

/**
 * Markiert User für Downgrade (wird bei Kündigung aufgerufen)
 */
export const markForDowngrade = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      usageStats: {
        ...user.usageStats,
        resetOnDowngrade: true,
      },
      updatedAt: Date.now(),
    });

    console.log(`[Downgrade] User ${args.clerkId} marked for counter reset`);
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

    console.log(`[Downgrade] Customer ${args.stripeCustomerId} marked for counter reset at ${new Date(args.subscriptionEndDate).toISOString()}`);
  },
});

/**
 * Update Subscription via Clerk ID (für Stripe Webhooks)
 */
export const updateSubscriptionByClerkId = internalMutation({
  args: {
    clerkId: v.string(),
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

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

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.subscription !== undefined) {
      updates.subscription = args.subscription;
    }
    if (args.subscriptionStatus !== undefined) {
      updates.subscriptionStatus = args.subscriptionStatus;
    }

    // usageStats aktualisieren
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

// ============================================================
// PUBLIC MUTATIONS - USER SYNC FALLBACK
// ============================================================

/**
 * Sync user from Clerk token to Convex if not exists
 * This is a fallback for when webhooks fail or are delayed
 * Called from ProtectedLayout when currentUser is undefined
 */
export const syncUserIfNotExists = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkId = identity.subject;

    // Check if user already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();

    if (existing) {
      console.log(`[UserSync] User ${clerkId} already exists, skipping sync`);
      return existing._id;
    }

    // Extract user data from Clerk token
    const email = identity.email?.[0]?.emailAddress;
    const name = identity.name || email?.split("@")[0] || "User";
    const avatar = identity.pictureUrl;

    const now = Date.now();

    // Create user from Clerk token data
    const userId = await ctx.db.insert("users", {
      clerkId,
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

    console.log(`[UserSync] ✅ Created user ${clerkId} in Convex from Clerk token`);
    return userId;
  },
});

// ============================================================
// INTERNAL MUTATIONS - FOR WEBHOOKS
// ============================================================

/**
 * Create or update user from Clerk webhook
 * Called from http.ts clerk-webhook endpoint
 * NOTE: Duplicate of createOrUpdateUser but as internalMutation for HTTP Actions
 */
export const createOrUpdateUserFromWebhook = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // CRITICAL FIX: Check for existing user by EMAIL first (Clerk sends user.created twice)
    // The first user.created is for unverified email, second for verified email
    // Both have different clerkId but same email - we need to deduplicate!
    if (args.email) {
      const existingUserByEmail = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), args.email))
        .first();

      if (existingUserByEmail) {
        // User mit dieser Email existiert bereits!
        // Update nur die clerkId auf die neue verifizierte ID und update Profil-Daten
        await ctx.db.patch(existingUserByEmail._id, {
          clerkId: args.clerkId, // Update zur neuen (verifizierten) clerkId
          name: args.name ?? existingUserByEmail.name,
          avatar: args.avatar ?? existingUserByEmail.avatar,
          updatedAt: now,
        });
        console.log(`[Webhook] 🔀 User with email ${args.email} already exists, updated clerkId to ${args.clerkId}`);
        return existingUserByEmail._id;
      }
    }

    // Check if user exists by clerkId
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      // Update existing user (nur Profil-Daten, Usage Stats bleiben!)
      await ctx.db.patch(existingUser._id, {
        email: args.email ?? existingUser.email,
        name: args.name ?? existingUser.name,
        avatar: args.avatar ?? existingUser.avatar,
        updatedAt: now,
      });
      console.log(`[Webhook] User ${args.clerkId} updated in Convex`);
      return existingUser._id;
    }

    // Create new user mit usageStats
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      avatar: args.avatar,
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
    console.log(`[Webhook] ✅ User ${args.clerkId} created in Convex`);
    return userId;
  },
});

/**
 * Delete user from Clerk webhook
 * Called from http.ts clerk-webhook endpoint
 * NOTE: Duplicate of deleteUser but as internalMutation for HTTP Actions
 */
export const deleteUserFromWebhook = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      console.log(`[Webhook] User ${args.clerkId} not found in Convex, already deleted`);
      return { success: true, message: "User not found" };
    }

    // Delete all user's recipes
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", args.clerkId))
      .collect();

    for (const recipe of recipes) {
      await ctx.db.delete(recipe._id);
    }

    // Delete all user's weekly meals
    const weeklyMeals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("clerkId", args.clerkId))
      .collect();

    for (const meal of weeklyMeals) {
      await ctx.db.delete(meal._id);
    }

    // Delete all user's shopping items
    const shoppingItems = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("clerkId", args.clerkId))
      .collect();

    for (const item of shoppingItems) {
      await ctx.db.delete(item._id);
    }

    // Finally delete the user record
    await ctx.db.delete(user._id);

    console.log(`[Webhook] ✅ User ${args.clerkId} and all associated data deleted from Convex`);
    return {
      success: true,
      deletedRecipes: recipes.length,
      deletedWeeklyMeals: weeklyMeals.length,
      deletedShoppingItems: shoppingItems.length,
    };
  },
});

/**
 * ADMIN: Manuelles Setzen der Usage Stats für einen User
 */
export const setUsageStats = mutation({
  args: { 
    clerkId: v.string(),
    manualRecipes: v.optional(v.number()),
    linkImports: v.optional(v.number()),
    photoScans: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");

    const currentStats = user.usageStats || {
      manualRecipes: 0,
      linkImports: 0,
      photoScans: 0,
      subscriptionStartDate: undefined,
      subscriptionEndDate: undefined,
      resetOnDowngrade: false,
    };

    await ctx.db.patch(user._id, {
      usageStats: {
        ...currentStats,
        manualRecipes: args.manualRecipes ?? currentStats.manualRecipes,
        linkImports: args.linkImports ?? currentStats.linkImports,
        photoScans: args.photoScans ?? currentStats.photoScans,
      },
      updatedAt: Date.now(),
    });
  }
});

