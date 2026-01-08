import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get weekly plan for a specific week
export const getWeeklyPlan = query({
  args: { weekStart: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const weeklyPlan = await ctx.db
      .query("weeklyPlans")
      .withIndex("by_user_week", (q) => 
        q.eq("clerkId", identity.subject).eq("weekStart", args.weekStart)
      )
      .first();

    return weeklyPlan;
  },
});

// Create or update weekly plan
export const upsertWeeklyPlan = mutation({
  args: {
    weekStart: v.string(),
    recipes: v.array(
      v.object({
        dayOfWeek: v.string(),
        mealType: v.string(),
        recipeId: v.id("recipes"),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check if plan exists
    const existingPlan = await ctx.db
      .query("weeklyPlans")
      .withIndex("by_user_week", (q) => 
        q.eq("clerkId", identity.subject).eq("weekStart", args.weekStart)
      )
      .first();

    const now = Date.now();

    if (existingPlan) {
      await ctx.db.patch(existingPlan._id, {
        recipes: args.recipes,
        updatedAt: now,
      });
      return existingPlan._id;
    } else {
      const planId = await ctx.db.insert("weeklyPlans", {
        clerkId: identity.subject,
        weekStart: args.weekStart,
        recipes: args.recipes,
        createdAt: now,
        updatedAt: now,
      });
      return planId;
    }
  },
});

// Add recipe to weekly plan
export const addRecipeToPlan = mutation({
  args: {
    weekStart: v.string(),
    dayOfWeek: v.string(),
    mealType: v.string(),
    recipeId: v.id("recipes"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get or create weekly plan
    let plan = await ctx.db
      .query("weeklyPlans")
      .withIndex("by_user_week", (q) => 
        q.eq("clerkId", identity.subject).eq("weekStart", args.weekStart)
      )
      .first();

    const now = Date.now();

    if (!plan) {
      const planId = await ctx.db.insert("weeklyPlans", {
        clerkId: identity.subject,
        weekStart: args.weekStart,
        recipes: [{
          dayOfWeek: args.dayOfWeek,
          mealType: args.mealType,
          recipeId: args.recipeId,
        }],
        createdAt: now,
        updatedAt: now,
      });
      return planId;
    } else {
      await ctx.db.patch(plan._id, {
        recipes: [...plan.recipes, {
          dayOfWeek: args.dayOfWeek,
          mealType: args.mealType,
          recipeId: args.recipeId,
        }],
        updatedAt: now,
      });
      return plan._id;
    }
  },
});

// Remove recipe from weekly plan
export const removeRecipeFromPlan = mutation({
  args: {
    weekStart: v.string(),
    dayOfWeek: v.string(),
    mealType: v.string(),
    recipeId: v.id("recipes"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const plan = await ctx.db
      .query("weeklyPlans")
      .withIndex("by_user_week", (q) => 
        q.eq("clerkId", identity.subject).eq("weekStart", args.weekStart)
      )
      .first();

    if (!plan) {
      throw new Error("Weekly plan not found");
    }

    const filteredRecipes = plan.recipes.filter(
      (r) => !(
        r.dayOfWeek === args.dayOfWeek &&
        r.mealType === args.mealType &&
        r.recipeId === args.recipeId
      )
    );

    await ctx.db.patch(plan._id, {
      recipes: filteredRecipes,
      updatedAt: Date.now(),
    });
  },
});

// Clear weekly plan
export const clearWeeklyPlan = mutation({
  args: { weekStart: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const plan = await ctx.db
      .query("weeklyPlans")
      .withIndex("by_user_week", (q) => 
        q.eq("clerkId", identity.subject).eq("weekStart", args.weekStart)
      )
      .first();

    if (!plan) {
      throw new Error("Weekly plan not found");
    }

    await ctx.db.patch(plan._id, {
      recipes: [],
      updatedAt: Date.now(),
    });
  },
});

// Get all weekly plans for current user
export const listAllPlans = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const plans = await ctx.db
      .query("weeklyPlans")
      .withIndex("by_user_week", (q) => q.eq("clerkId", identity.subject))
      .collect();

    return plans;
  },
});
