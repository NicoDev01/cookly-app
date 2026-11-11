import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { storeAnalyticsEvent } from "./analytics";
import { getRecipeThumbnailUrl } from "./recipeThumbnails";
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

/** Ab hier speichert die App Rezeptbezug bzw. -titel selbst; ältere Einträge ohne beides werden per Name zugeordnet. */
const LEGACY_RECIPE_LOOKUP_BEFORE = Date.UTC(2026, 10, 10);

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
    // Alle verknüpften Rezepte laden: Einträge gelöschter Rezepte (Altbestand vor der Bereinigung beim Löschen) ausblenden.
    const linkedRecipeIds = [...new Set(resolvedItems.flatMap(({ recipeId }) => (recipeId ? [recipeId] : [])))];
    const linkedRecipes = await Promise.all(linkedRecipeIds.map((recipeId) => {
      const id = ctx.db.normalizeId("recipes", recipeId);
      return id ? ctx.db.get(id) : null;
    }));
    const recipeTitles = new Map(linkedRecipes.flatMap((recipe) =>
      recipe && recipe.userId === user._id
        ? [[recipe._id, recipe.title] as const]
        : []
    ));
    const existingRecipeIds = new Set(linkedRecipes.flatMap((recipe) => (recipe ? [recipe._id as string] : [])));
    const liveItems = resolvedItems.filter(({ recipeId }) => !recipeId || existingRecipeIds.has(recipeId));
    // Nur Alt-Einträge ohne Rezeptbezug brauchen den Namensabgleich über alle Rezepte.
    // Neue eigene Einträge (Schnelleingabe) würden ihn sonst bei jedem Listen-Update auslösen.
    const isLegacyUnlinked = (item: (typeof items)[number], recipeId: unknown) =>
      !recipeId && !item.recipeTitle && item.createdAt < LEGACY_RECIPE_LOOKUP_BEFORE;
    const needsLegacyLookup = liveItems.some(({ item, recipeId }) => isLegacyUnlinked(item, recipeId));
    const legacyRecipes = needsLegacyLookup
      ? await ctx.db
        .query("recipes")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
      : [];

    return liveItems.map(({ item, recipeId }) => {
      if (recipeId) {
        return {
          ...item,
          recipeId,
          recipeTitle: item.recipeTitle ?? recipeTitles.get(recipeId),
        };
      }

      if (!isLegacyUnlinked(item, recipeId)) return item;
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

/** Nur die Rezept-IDs auf der Liste: So weiß der Wochenplan, was schon eingekauft wird, ohne die ganze Liste zu laden. */
export const getRecipeIdsOnList = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    const items = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const ids = new Set<Id<"recipes">>();
    for (const item of items) {
      const recipeId = item.recipeId ?? getRecipeIdFromShoppingKey(item.key);
      if (recipeId) ids.add(recipeId);
    }
    return [...ids];
  },
});

/**
 * Wochenplan → Einkaufsliste in einem Schritt. Zutaten liest der Server selbst, der Client lädt sie nie.
 * Rezepte, von denen schon etwas auf der Liste steht, werden übersprungen (kein Doppeltes beim zweiten Tippen).
 */
export const addRecipesToShoppingList = mutation({
  args: { recipeIds: v.array(v.id("recipes")) },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const items = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Pro Zutat abgleichen, nicht pro Rezept: Steht schon eine einzelne Zutat auf der Liste
    // (auf der Rezeptseite angetippt), kommen die übrigen trotzdem dazu.
    const existingKeys = new Set(items.map((item) => item.key));

    let recipesAdded = 0;
    let itemsAdded = 0;
    const now = Date.now();
    for (const recipeId of new Set(args.recipeIds)) {
      const recipe = await assertRecipeAccessible(ctx, recipeId, userId);
      const before = itemsAdded;
      for (const ingredient of recipe.ingredients) {
        const name = ingredient.name.trim();
        if (!name) continue;
        const key = buildShoppingItemKey(name, recipeId);
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        await ctx.db.insert("shoppingItems", {
          userId,
          name,
          normalizedName: name.toLowerCase(),
          amount: ingredient.amount || undefined,
          key,
          checked: false,
          recipeId,
          recipeTitle: recipe.title,
          createdAt: now,
        });
        itemsAdded++;
      }
      if (itemsAdded > before) recipesAdded++;
    }
    return { recipesAdded, itemsAdded };
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

// ---------------------------------------------------------------------------
// Neue Einkaufsliste (09.11.2026). Die alten Funktionen oben bleiben für ältere App-Versionen im Store.
// ---------------------------------------------------------------------------

const getOwnedItems = async (ctx: MutationCtx, ids: Id<"shoppingItems">[], userId: Id<"users">) => {
  const items = await Promise.all([...new Set(ids)].map((id) => ctx.db.get(id)));
  return items.filter((item): item is NonNullable<typeof item> => item !== null && item.userId === userId);
};

/** Rezeptbilder für „Nach Rezept“: nur Vorschaufelder, nur wenn die Ansicht offen ist (Client nutzt "skip"). */
export const getShoppingRecipes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    const items = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const recipeIds = [...new Set(items.flatMap((item) => {
      const recipeId = item.recipeId ?? getRecipeIdFromShoppingKey(item.key);
      return recipeId ? [recipeId] : [];
    }))];
    const recipes = await Promise.all(recipeIds.map(async (recipeId) => {
      const recipe = await ctx.db.get(recipeId);
      if (!recipe || recipe.userId !== userId) return null;
      const storedImage = recipe.imageStorageId ? await ctx.storage.getUrl(recipe.imageStorageId) : null;
      return {
        _id: recipe._id,
        title: recipe.title,
        image: storedImage ?? recipe.image,
        thumbnail: await getRecipeThumbnailUrl(ctx, recipe),
        imageBlurhash: recipe.imageBlurhash,
        sourceImageUrl: recipe.sourceImageUrl,
      };
    }));
    return recipes.filter((recipe): recipe is NonNullable<typeof recipe> => recipe !== null);
  },
});

/** Abhaken/Öffnen mehrerer Einträge auf einmal: Eine Pill kann dieselbe Zutat aus mehreren Rezepten bündeln. */
export const setShoppingItemsChecked = mutation({
  args: { ids: v.array(v.id("shoppingItems")), checked: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const items = await getOwnedItems(ctx, args.ids, userId);
    const changed = items.filter((item) => item.checked !== args.checked);
    for (const item of changed) await ctx.db.patch(item._id, { checked: args.checked });
    if (args.checked && changed.length > 0) {
      const user = await ctx.db.get(userId);
      const now = Date.now();
      await storeAnalyticsEvent(ctx, {
        eventId: `shopping:${changed[0]._id}:checked:${now}`,
        name: "shopping_item_checked",
        version: 1,
        userId,
        billingUserId: user?.billingUserId,
        platform: "server",
        properties: { recipeId: changed[0].recipeId ? String(changed[0].recipeId) : undefined },
        occurredAt: now,
      });
    }
  },
});

export const removeShoppingItems = mutation({
  args: { ids: v.array(v.id("shoppingItems")) },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const items = await getOwnedItems(ctx, args.ids, userId);
    for (const item of items) await ctx.db.delete(item._id);
  },
});

/** „Rückgängig“ nach dem Entfernen: legt die Einträge mit ihren alten Daten neu an. */
export const restoreShoppingItems = mutation({
  args: {
    items: v.array(v.object({
      name: v.string(),
      amount: v.optional(v.string()),
      checked: v.boolean(),
      recipeId: v.optional(v.id("recipes")),
      recipeTitle: v.optional(v.string()),
      createdAt: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const existing = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const keys = new Set(existing.map((item) => item.key));
    for (const item of args.items) {
      // Rezept inzwischen gelöscht? Dann kommt die Zutat als eigener Eintrag zurück statt gar nicht.
      const recipe = item.recipeId ? await ctx.db.get(item.recipeId) : null;
      const recipeId = recipe && recipe.userId === userId ? recipe._id : undefined;
      const key = buildShoppingItemKey(item.name, recipeId);
      if (keys.has(key)) continue;
      keys.add(key);
      await ctx.db.insert("shoppingItems", {
        userId,
        name: item.name,
        normalizedName: normalizeShoppingText(item.name),
        amount: item.amount,
        key,
        checked: item.checked,
        recipeId,
        recipeTitle: recipeId ? item.recipeTitle : undefined,
        createdAt: item.createdAt,
      });
    }
  },
});

/**
 * Schnelleingabe ohne Rezept. Gibt es den eigenen Eintrag schon, wird er wieder offen (und bekommt die neue Menge),
 * statt doppelt angelegt zu werden.
 */
export const quickAddShoppingItem = mutation({
  args: { name: v.string(), amount: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const name = args.name.trim().slice(0, 120);
    if (!name) throw new Error("Name fehlt");
    const amount = args.amount?.trim().slice(0, 40) || undefined;
    const key = buildShoppingItemKey(name);
    const existing = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { checked: false, ...(amount ? { amount } : {}) });
      return existing._id;
    }
    return await ctx.db.insert("shoppingItems", {
      userId,
      name,
      normalizedName: normalizeShoppingText(name),
      amount,
      key,
      checked: false,
      createdAt: Date.now(),
    });
  },
});

export const updateShoppingItem = mutation({
  args: { id: v.id("shoppingItems"), name: v.string(), amount: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== userId) throw new Error("Item not found or access denied");
    const name = args.name.trim().slice(0, 120);
    if (!name) throw new Error("Name fehlt");
    await ctx.db.patch(args.id, {
      name,
      normalizedName: normalizeShoppingText(name),
      amount: args.amount?.trim().slice(0, 40) || undefined,
      key: buildShoppingItemKey(name, item.recipeId),
    });
  },
});
