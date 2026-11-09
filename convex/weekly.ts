import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
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
      // Nur was der Plan zeigt: Zutaten und Anleitung lädt erst die Rezeptseite.
      return [recipeId, {
        _id: recipe._id,
        title: recipe.title,
        image: storedImage ?? recipe.image,
        imageBlurhash: recipe.imageBlurhash,
        sourceImageUrl: recipe.sourceImageUrl,
        isFavorite: recipe.isFavorite,
      }] as const;
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

const slotScope = v.union(v.literal("day"), v.literal("week"));

/** YYYY-MM-DD um n Tage verschieben (UTC, damit keine Zeitzone dazwischenfunkt). */
const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const loadOwnMeals = async (ctx: MutationCtx, userId: Id<"users">, mealIds: Id<"weeklyMeals">[]) => {
  const meals = await Promise.all(mealIds.map((id) => ctx.db.get(id)));
  return meals.map((meal) => {
    if (!meal || meal.userId !== userId) throw new Error("Meal not found or access denied");
    return meal;
  });
};

/** Nur ja/nein: Reicht für „Vorwoche übernehmen“ und liest höchstens einen Eintrag. */
export const hasMealsInRange = query({
  args: { startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const first = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", args.startDate).lte("date", args.endDate))
      .first();
    return first !== null;
  },
});

export const moveMeals = mutation({
  args: { mealIds: v.array(v.id("weeklyMeals")), date: v.string(), scope: slotScope },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const meals = await loadOwnMeals(ctx, userId, args.mealIds);
    const now = Date.now();
    for (const meal of meals) {
      await ctx.db.patch(meal._id, { date: args.date, scope: args.scope, updatedAt: now });
    }
  },
});

export const removeMeals = mutation({
  args: { mealIds: v.array(v.id("weeklyMeals")) },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const meals = await loadOwnMeals(ctx, userId, args.mealIds);
    for (const meal of meals) await ctx.db.delete(meal._id);
  },
});

/** „Rückgängig“ nach dem Entfernen: legt die Gerichte neu an (ohne Analytics, es ist kein neues Planen). */
export const restoreMeals = mutation({
  args: { meals: v.array(v.object({ recipeId: v.id("recipes"), date: v.string(), scope: slotScope })) },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const now = Date.now();
    for (const meal of args.meals) {
      const recipe = await ctx.db.get(meal.recipeId);
      if (!recipe || recipe.userId !== userId) continue; // Rezept inzwischen gelöscht: still überspringen.
      await ctx.db.insert("weeklyMeals", { userId, ...meal, createdAt: now, updatedAt: now });
    }
  },
});

/** Kopiert eine Woche auf dieselben Wochentage einer anderen. Nur in eine leere Woche, damit ein Doppeltipp nichts verdoppelt. */
export const copyWeek = mutation({
  args: { sourceStartDate: v.string(), targetStartDate: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const inRange = (start: string) => ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", start).lte("date", shiftDate(start, 6)));
    if ((await inRange(args.targetStartDate).first()) !== null) return 0;

    const offset = Math.round((Date.parse(`${args.targetStartDate}T00:00:00Z`) - Date.parse(`${args.sourceStartDate}T00:00:00Z`)) / 86_400_000);
    const source = await inRange(args.sourceStartDate).collect();
    const now = Date.now();
    for (const meal of source) {
      await ctx.db.insert("weeklyMeals", {
        userId,
        recipeId: meal.recipeId,
        date: shiftDate(meal.date, offset),
        scope: meal.scope ?? "day",
        createdAt: now,
        updatedAt: now,
      });
    }
    return source.length;
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
