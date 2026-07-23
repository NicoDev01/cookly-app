import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { storeAnalyticsEvent } from "./analytics";
import { getAuthenticatedUserId } from "./lib/authUser";

export const getWeek = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    const meals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q
        .eq("userId", userId)
        .gte("date", args.startDate)
        .lte("date", args.endDate))
      .collect();

    const recipeIds = [...new Set(meals.map((meal) => meal.recipeId))];
    const recipeEntries = await Promise.all(recipeIds.map(async (recipeId) => {
      const recipe = await ctx.db.get(recipeId);
      if (!recipe || recipe.userId !== userId) return null;
      const storedImage = recipe.imageStorageId
        ? await ctx.storage.getUrl(recipe.imageStorageId)
        : null;
      return [recipeId, { ...recipe, image: storedImage ?? recipe.image }] as const;
    }));
    const recipes = new Map(recipeEntries.filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null
    ));

    return meals.flatMap((meal) => {
      const recipe = recipes.get(meal.recipeId);
      return recipe ? [{
        mealId: meal._id,
        date: meal.date,
        scope: meal.scope,
        recipe,
      }] : [];
    });
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
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe || recipe.userId !== userId) {
      throw new Error("Recipe not found or access denied");
    }

    const scope = args.scope ?? (args.date.includes('#WEEKLY') ? "week" : "day");
    const cleanDate = args.date.replace('#WEEKLY', '');
    const now = Date.now();

    const mealId = await ctx.db.insert("weeklyMeals", {
      userId,
      recipeId: args.recipeId,
      date: cleanDate,
      scope,
      createdAt: now,
      updatedAt: now,
    });
    const user = await ctx.db.get(userId);
    await storeAnalyticsEvent(ctx, {
      eventId: `weekly:${mealId}:added`,
      name: "weekly_meal_added",
      version: 1,
      userId,
      billingUserId: user?.billingUserId,
      platform: "server",
      properties: { recipeId: String(args.recipeId), scope },
      occurredAt: now,
    });
    return mealId;
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

    for (const recipeId of args.recipeIds) {
      const recipe = await ctx.db.get(recipeId);
      if (!recipe || recipe.userId !== userId) {
        throw new Error("Recipe not found or access denied");
      }
    }

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
      const user = await ctx.db.get(userId);
      await storeAnalyticsEvent(ctx, {
        eventId: `weekly:${mealId}:added`,
        name: "weekly_meal_added",
        version: 1,
        userId,
        billingUserId: user?.billingUserId,
        platform: "server",
        properties: { recipeId: String(recipeId), scope },
        occurredAt: now,
      });
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
