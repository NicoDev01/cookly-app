import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

async function getAuthenticatedUserId(ctx: any): Promise<Id<"users">> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_authUserId", (q: any) => q.eq("authUserId", authUserId.toString()))
    .first();
  if (!user) throw new Error("User not found");
  return user._id;
}

export const getWeek = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    const allMeals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .collect();

    const filteredMeals = allMeals.filter(meal =>
      meal.date >= args.startDate && meal.date <= args.endDate
    );

    const recipeIds = filteredMeals.map(meal => meal.recipeId);
    const recipes = new Map();
    for (const recipeId of recipeIds) {
      const recipe = await ctx.db.get(recipeId);
      if (recipe) recipes.set(recipeId, recipe);
    }

    const result: any[] = [];
    for (const meal of filteredMeals) {
      const recipe = recipes.get(meal.recipeId);
      if (recipe) {
        let imageUrl = recipe.image;
        if (recipe.imageStorageId) {
          const url = await ctx.storage.getUrl(recipe.imageStorageId);
          if (url) imageUrl = url;
        }
        result.push({
          mealId: meal._id,
          date: meal.date,
          scope: meal.scope,
          recipe: { ...recipe, _id: recipe._id, image: imageUrl },
        });
      }
    }

    return result;
  },
});

export const addMeal = mutation({
  args: {
    recipeId: v.id("recipes"),
    date: v.string(),
    scope: v.optional(v.union(v.literal("day"), v.literal("week"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    const scope = args.scope ?? (args.date.includes('#WEEKLY') ? "week" : "day");
    const cleanDate = args.date.replace('#WEEKLY', '');
    const now = Date.now();

    return await ctx.db.insert("weeklyMeals", {
      userId,
      recipeId: args.recipeId,
      date: cleanDate,
      scope,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeMeal = mutation({
  args: { mealId: v.id("weeklyMeals") },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const meal = await ctx.db.get(args.mealId);
    if (!meal) throw new Error("Meal not found");
    if (meal.userId !== userId) throw new Error("Access denied");
    await ctx.db.delete(args.mealId);
  },
});

export const addMeals = mutation({
  args: {
    recipeIds: v.array(v.id("recipes")),
    date: v.string(),
    scope: v.optional(v.union(v.literal("day"), v.literal("week"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    const scope = args.scope ?? (args.date.includes('#WEEKLY') ? "week" : "day");
    const cleanDate = args.date.replace('#WEEKLY', '');
    const now = Date.now();
    const mealIds: Id<"weeklyMeals">[] = [];

    for (const recipeId of args.recipeIds) {
      const mealId = await ctx.db.insert("weeklyMeals", {
        userId,
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

export const getWeeklyListIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    const meals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .collect();
    return meals.map(meal => meal.recipeId);
  },
});
