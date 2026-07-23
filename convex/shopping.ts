import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { storeAnalyticsEvent } from "./analytics";
import { getAuthenticatedUserId } from "./lib/authUser";

const normalizeShoppingText = (value: string) => value.toLowerCase().trim().replace(/\s+/g, " ");

const buildShoppingItemKey = (name: string, recipeId?: Id<"recipes">) => {
  const baseKey = normalizeShoppingText(name);
  return recipeId ? `${baseKey}|recipe:${recipeId}` : baseKey;
};

const buildLegacyShoppingItemKeys = (name: string, amount?: string, recipeId?: Id<"recipes">) => {
  const normalizedName = normalizeShoppingText(name);
  const normalizedAmount = amount ? normalizeShoppingText(amount) : "";
  return [
    recipeId && normalizedAmount ? `${normalizedName}|${normalizedAmount}|recipe:${recipeId}` : undefined,
    `${normalizedName}|${normalizedAmount}`,
    normalizedName,
  ].filter((key): key is string => Boolean(key));
};

const getRecipeIdFromShoppingKey = (key: string): Id<"recipes"> | undefined => {
  const marker = "|recipe:";
  const markerIndex = key.lastIndexOf(marker);
  if (markerIndex === -1) return undefined;
  return key.slice(markerIndex + marker.length) as Id<"recipes">;
};

const assertRecipeAccessible = async (
  ctx: QueryCtx | MutationCtx,
  recipeId: Id<"recipes">,
  userId: Id<"users">,
) => {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe || (recipe.userId && recipe.userId !== userId)) {
    throw new Error("Recipe not found or access denied");
  }
  return recipe;
};

export const getShoppingList = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
      .first();
    if (!user) return [];

    const items = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const resolvedItems = items.map((item) => ({
      item,
      recipeId: item.recipeId ?? getRecipeIdFromShoppingKey(item.key),
    }));
    const linkedRecipeIds = [...new Set(resolvedItems
      .filter(({ item, recipeId }) => recipeId && !item.recipeTitle)
      .map(({ recipeId }) => recipeId!))];
    const linkedRecipes = await Promise.all(linkedRecipeIds.map((recipeId) => ctx.db.get(recipeId)));
    const recipeTitles = new Map(linkedRecipes.flatMap((recipe) =>
      recipe && recipe.userId === user._id
        ? [[recipe._id, recipe.title] as const]
        : []
    ));
    const needsLegacyLookup = resolvedItems.some(({ recipeId }) => !recipeId);
    const legacyRecipes = needsLegacyLookup
      ? await ctx.db
        .query("recipes")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
      : [];

    return resolvedItems.map(({ item, recipeId }) => {
      if (recipeId) {
        return {
          ...item,
          recipeId,
          recipeTitle: item.recipeTitle ?? recipeTitles.get(recipeId),
        };
      }

      const normalizedName = normalizeShoppingText(item.name);
      const matchingRecipes = legacyRecipes.filter((recipe) =>
        recipe.ingredients.some((ingredient) =>
          normalizeShoppingText(ingredient.name) === normalizedName
        )
      );
      if (matchingRecipes.length === 1) {
        return { ...item, recipeTitle: matchingRecipes[0].title };
      }

      return {
        ...item,
      };
    });
  },
});

export const addShoppingItem = mutation({
  args: {
    name: v.string(),
    amount: v.optional(v.string()),
    recipeId: v.optional(v.id("recipes")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    let recipeTitle: string | undefined;
    if (args.recipeId) {
      const recipe = await assertRecipeAccessible(ctx, args.recipeId, userId);
      recipeTitle = recipe.title;
    }

    const normalizedName = args.name.toLowerCase().trim();
    const key = buildShoppingItemKey(args.name, args.recipeId);
    const candidateKeys = [key, ...buildLegacyShoppingItemKeys(args.name, args.amount, args.recipeId)];

    const userItems = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const exactExisting = userItems.find((item) => item.key === key);
    if (exactExisting) return exactExisting._id;

    const legacyExisting = userItems.find((item) => item.key !== key && candidateKeys.includes(item.key));
    if (legacyExisting && args.recipeId) {
      await ctx.db.patch(legacyExisting._id, {
        key,
        recipeId: args.recipeId,
        recipeTitle,
        amount: args.amount,
      });
      return legacyExisting._id;
    }

    if (legacyExisting) return legacyExisting._id;

    return await ctx.db.insert("shoppingItems", {
      userId,
      name: args.name,
      normalizedName,
      amount: args.amount,
      key,
      checked: false,
      recipeId: args.recipeId,
      recipeTitle,
      createdAt: Date.now(),
    });
  },
});

export const toggleShoppingItemByDetails = mutation({
  args: {
    name: v.string(),
    amount: v.optional(v.string()),
    recipeId: v.optional(v.id("recipes")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    let recipeTitle: string | undefined;
    if (args.recipeId) {
      const recipe = await assertRecipeAccessible(ctx, args.recipeId, userId);
      recipeTitle = recipe.title;
    }

    const normalizedName = args.name.toLowerCase().trim();
    const key = buildShoppingItemKey(args.name, args.recipeId);
    const candidateKeys = [key, ...buildLegacyShoppingItemKeys(args.name, args.amount, args.recipeId)];

    const userItems = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const exactExisting = userItems.find((item) => item.key === key);

    if (exactExisting) {
      await ctx.db.delete(exactExisting._id);
      return { action: "removed", id: exactExisting._id };
    }

    const recipeLegacyExisting = args.recipeId
      ? userItems.find((item) => item.key !== key && item.key.endsWith(`|recipe:${args.recipeId}`) && candidateKeys.includes(item.key))
      : undefined;
    if (recipeLegacyExisting) {
      await ctx.db.delete(recipeLegacyExisting._id);
      return { action: "removed", id: recipeLegacyExisting._id };
    }

    const legacyExisting = userItems.find((item) => item.key !== key && candidateKeys.includes(item.key));
    if (legacyExisting && args.recipeId) {
      await ctx.db.patch(legacyExisting._id, {
        key,
        recipeId: args.recipeId,
        recipeTitle,
        amount: args.amount,
      });
      return { action: "added", id: legacyExisting._id };
    }

    if (legacyExisting) {
      await ctx.db.delete(legacyExisting._id);
      return { action: "removed", id: legacyExisting._id };
    }

    const itemId = await ctx.db.insert("shoppingItems", {
      userId,
      name: args.name,
      normalizedName,
      amount: args.amount,
      key,
      checked: false,
      recipeId: args.recipeId,
      recipeTitle,
      createdAt: Date.now(),
    });
    return { action: "added", id: itemId };
  },
});

export const toggleShoppingItem = mutation({
  args: { id: v.id("shoppingItems") },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== userId) throw new Error("Item not found or access denied");
    const checked = !item.checked;
    await ctx.db.patch(args.id, { checked });
    if (checked) {
      const user = await ctx.db.get(userId);
      const now = Date.now();
      await storeAnalyticsEvent(ctx, {
        eventId: `shopping:${args.id}:checked:${now}`,
        name: "shopping_item_checked",
        version: 1,
        userId,
        billingUserId: user?.billingUserId,
        platform: "server",
        properties: { recipeId: item.recipeId ? String(item.recipeId) : undefined },
        occurredAt: now,
      });
    }
  },
});

export const removeShoppingItem = mutation({
  args: { id: v.id("shoppingItems") },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== userId) throw new Error("Item not found or access denied");
    await ctx.db.delete(args.id);
  },
});

export const clearShoppingList = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    const items = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
  },
});
