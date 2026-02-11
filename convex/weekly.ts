import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const getAuthenticatedClerkId = async (ctx: any) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
};

export const getWeek = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // Get all weekly meals for the user within date range
    const allMeals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("clerkId", clerkId))
      .collect();

    // Filter by date range on backend (client-side filter for now, will be optimized with compound index)
    const filteredMeals = allMeals.filter(meal => {
      return meal.date >= args.startDate && meal.date <= args.endDate;
    });

    // Batch fetch all recipe details - Collect all recipe IDs first
    const recipeIds = filteredMeals.map(meal => meal.recipeId);
    const recipes = new Map();

    // Fetch all recipes in parallel
    for (const recipeId of recipeIds) {
      const recipe = await ctx.db.get(recipeId);
      if (recipe) {
        recipes.set(recipeId, recipe);
      }
    }

    // Combine results AND resolve storage URLs
    const result: any[] = [];
    for (const meal of filteredMeals) {
      const recipe = recipes.get(meal.recipeId);
      if (recipe) {
        // Resolve storage URL if exists
        let imageUrl = recipe.image;
        if (recipe.imageStorageId) {
          const url = await ctx.storage.getUrl(recipe.imageStorageId);
          if (url) imageUrl = url;
        }

        result.push({
          mealId: meal._id,
          date: meal.date,
          scope: meal.scope, // "day" or "week"
          recipe: {
            ...recipe,
            _id: recipe._id,
            image: imageUrl, // Use resolved storage URL
          },
        });
      }
    }

    return result;
  },
});

// Add a single meal to weekly plan
export const addMeal = mutation({
  args: {
    recipeId: v.id("recipes"),
    date: v.string(),
    scope: v.optional(v.union(v.literal("day"), v.literal("week"))),
  },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // Determine scope: if date contains #WEEKLY suffix, use "week", otherwise "day"
    const scope = args.scope ?? (args.date.includes('#WEEKLY') ? "week" : "day");
    // Clean date string (remove #WEEKLY suffix if present)
    const cleanDate = args.date.replace('#WEEKLY', '');

    const now = Date.now();

    const mealId = await ctx.db.insert("weeklyMeals", {
      clerkId,
      recipeId: args.recipeId,
      date: cleanDate,
      scope,
      createdAt: now,
      updatedAt: now,
    });

    return mealId;
  },
});

// Remove a single meal by ID
export const removeMeal = mutation({
  args: {
    mealId: v.id("weeklyMeals"),
  },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const meal = await ctx.db.get(args.mealId);
    if (!meal) {
      throw new Error("Meal not found");
    }

    // Security check: only owner can delete
    if (meal.clerkId !== clerkId) {
      throw new Error("Access denied");
    }

    await ctx.db.delete(args.mealId);
  },
});

// Add multiple meals (batch)
export const addMeals = mutation({
  args: {
    recipeIds: v.array(v.id("recipes")),
    date: v.string(),
    scope: v.optional(v.union(v.literal("day"), v.literal("week"))),
  },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // Determine scope: if date contains #WEEKLY suffix, use "week", otherwise "day"
    const scope = args.scope ?? (args.date.includes('#WEEKLY') ? "week" : "day");
    // Clean date string
    const cleanDate = args.date.replace('#WEEKLY', '');

    const now = Date.now();
    const mealIds: Id<"weeklyMeals">[] = [];

    for (const recipeId of args.recipeIds) {
      const mealId = await ctx.db.insert("weeklyMeals", {
        clerkId,
        recipeId,
        date: cleanDate,
        scope,
        createdAt: now,
        updatedAt: now,
      });
      mealIds.push(mealId);
    }

    return mealIds;
  },
});

// Get weekly list IDs (for filtering)
export const getWeeklyListIds = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const meals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("clerkId", clerkId))
      .collect();

    return meals.map(meal => meal.recipeId);
  },
});
