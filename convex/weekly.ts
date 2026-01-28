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

    // Get all weekly meals for the user
    const allMeals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("clerkId", clerkId))
      .collect();

    // Filter by date range
    const filteredMeals = allMeals.filter(meal => {
      const mealDate = meal.date.replace('#WEEKLY', '');
      return mealDate >= args.startDate && mealDate <= args.endDate;
    });

    // Fetch all recipe details
    const result: any[] = [];
    for (const meal of filteredMeals) {
      const recipe = await ctx.db.get(meal.recipeId);
      if (recipe) {
        result.push({
          mealId: meal._id, // Use meal ID as unique identifier
          date: meal.date,
          recipe: {
            ...recipe,
            _id: recipe._id,
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
  },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // Clean date string (remove #WEEKLY suffix if present)
    const cleanDate = args.date.replace('#WEEKLY', '');

    const now = Date.now();

    const mealId = await ctx.db.insert("weeklyMeals", {
      clerkId,
      recipeId: args.recipeId,
      date: cleanDate,
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
  },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // Clean date string
    const cleanDate = args.date.replace('#WEEKLY', '');

    const now = Date.now();
    const mealIds: Id<"weeklyMeals">[] = [];

    for (const recipeId of args.recipeIds) {
      const mealId = await ctx.db.insert("weeklyMeals", {
        clerkId,
        recipeId,
        date: cleanDate,
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
