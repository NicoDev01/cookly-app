import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get current user
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

// Create or update user (called from Clerk webhook)
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
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        email: args.email ?? existingUser.email,
        name: args.name ?? existingUser.name,
        avatar: args.avatar ?? existingUser.avatar,
        updatedAt: now,
      });
      return existingUser._id;
    } else {
      // Create new user
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
          importedRecipes: 0,
          importsLastReset: now,
          weeklyPlansActive: 0,
        },
        createdAt: now,
        updatedAt: now,
      });
      return userId;
    }
  },
});

// Update onboarding data
export const updateOnboarding = mutation({
  args: {
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
      cookingFrequency: args.cookingFrequency ?? user.cookingFrequency,
      preferredCuisines: args.preferredCuisines ?? user.preferredCuisines,
      notificationsEnabled: args.notificationsEnabled,
      updatedAt: Date.now(),
    });
  },
});

// Complete onboarding
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

// Update subscription (called from Stripe webhook)
export const updateSubscription = mutation({
  args: {
    subscription: v.union(
      v.literal("free"),
      v.literal("pro_monthly"),
      v.literal("pro_yearly"),
      v.literal("lifetime")
    ),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("trialing")
    ),
    subscriptionEnd: v.optional(v.number()),
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
      subscriptionEnd: args.subscriptionEnd,
      stripeCustomerId: args.stripeCustomerId ?? user.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId ?? user.stripeSubscriptionId,
      updatedAt: Date.now(),
    });
  },
});

// Check usage limit
export const checkUsageLimit = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { canProceed: false, reason: "Not authenticated" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return { canProceed: false, reason: "User not found" };
    }

    // Pro, lifetime, and trialing users have no limits
    if (
      user.subscription === "pro_monthly" ||
      user.subscription === "pro_yearly" ||
      user.subscription === "lifetime" ||
      user.subscriptionStatus === "trialing"
    ) {
      return { canProceed: true, reason: "Pro user" };
    }

    // Check monthly import limit for free users
    const now = Date.now();
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
    
    if (user.usageStats.importsLastReset < oneMonthAgo) {
      // Reset counter if month has passed
      await ctx.db.patch(user._id, {
        usageStats: {
          ...user.usageStats,
          importedRecipes: 0,
          importsLastReset: now,
        },
      });
      return { canProceed: true, reason: "Monthly reset" };
    }

    if (user.usageStats.importedRecipes >= 5) {
      return {
        canProceed: false,
        reason: "LIMIT_REACHED",
        currentCount: user.usageStats.importedRecipes,
        limit: 5,
      };
    }

    return { canProceed: true, reason: "Under limit" };
  },
});

// Increment usage count
export const incrementUsageCount = mutation({
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
      usageStats: {
        ...user.usageStats,
        importedRecipes: user.usageStats.importedRecipes + 1,
      },
      updatedAt: Date.now(),
    });
  },
});
