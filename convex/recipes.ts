import { action, query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { FREE_LIMITS } from "./constants";
import { storeAnalyticsEvent } from "./analytics";
import { Id } from "./_generated/dataModel";
import { stripPollinationsApiKeyFromUrl } from "./pollinationsHelper";
import { claimRecipeAsset, deleteTrackedAsset } from "./storageAssets";
import { getAuthenticatedUserId } from "./lib/authUser";

// Compatibility endpoints for installed clients released before storage/image
// operations moved to storageAssets and remoteImages.
export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await getAuthenticatedUserId(ctx);
    return await ctx.runMutation(api.storageAssets.generateUploadUrl, { purpose: "recipe_image" });
  },
});

export const generateAndStoreAiImage = action({
  args: { recipeTitle: v.string() },
  handler: async (ctx, args): Promise<{ url: string; storageId: Id<"_storage"> }> =>
    await ctx.runAction(api.remoteImages.generateAndStoreAiImage, args),
});

export const proxyExternalImage = action({
  args: { recipeId: v.id("recipes") },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; imageStorageId?: Id<"_storage">; imageUrl?: string; errorCode?: string }> =>
    await ctx.runAction(api.remoteImages.proxyExternalImage, args),
});

export const proxyExternalImages = action({
  args: { recipeIds: v.array(v.id("recipes")) },
  handler: async (ctx, args): Promise<{ proxied: number; failed: number }> =>
    await ctx.runAction(api.remoteImages.proxyExternalImages, args),
});

// Helper: Kategorie-Statistiken aktualisieren
export async function adjustCategoryCount(ctx: any, category: string, amount: number, userId: Id<"users">) {
  const existing = await ctx.db
    .query("categoryStats")
    .withIndex("by_user_category", (q: any) => q.eq("userId", userId).eq("category", category))
    .first();

  if (existing) {
    const newCount = Math.max(0, existing.count + amount);
    if (newCount === 0) {
      await ctx.db.delete(existing._id);

      const categoryEntry = await ctx.db
        .query("categories")
        .withIndex("by_user_name", (q: any) => q.eq("userId", userId).eq("name", category))
        .first();

      if (categoryEntry) {
        if (categoryEntry.imageStorageId) {
          try {
            if (!await deleteTrackedAsset(ctx, userId, categoryEntry.imageStorageId)) {
              await ctx.storage.delete(categoryEntry.imageStorageId);
            }
          } catch (e) {
            console.warn(`[adjustCategoryCount] Could not delete category image:`, e);
          }
        }
        await ctx.db.delete(categoryEntry._id);
      }
    } else {
      await ctx.db.patch(existing._id, { count: newCount });
    }
  } else if (amount > 0) {
    await ctx.db.insert("categoryStats", { userId, category, count: amount });
  }
}

// Helper: Sicherstellen, dass Kategorie in categories-Tabelle existiert
export async function ensureCategoryExists(ctx: any, category: string, userId: Id<"users">) {
  const existing = await ctx.db
    .query("categories")
    .withIndex("by_user_name", (q: any) => q.eq("userId", userId).eq("name", category))
    .first();

  if (existing) return;

  const userCategories = await ctx.db
    .query("categories")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();

  const maxOrder = userCategories.length > 0
    ? Math.max(...userCategories.map((c: any) => c.order))
    : 0;

  await ctx.db.insert("categories", {
    userId,
    name: category,
    icon: "restaurant",
    color: "#6366f1",
    order: maxOrder + 1,
    isActive: true,
  });

  console.log(`[ensureCategoryExists] ✅ Created category "${category}" for user ${userId}`);
}

// List all recipes for current user
export const list = query({
  args: {
    includeIngredients: v.optional(v.boolean()),
    search: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    let recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (args.category) {
      recipes = recipes.filter(r => r.category === args.category);
    }

    if (args.search) {
      const lowerQuery = args.search.toLowerCase();
      recipes = recipes.filter(r => r.title.toLowerCase().includes(lowerQuery));
    }

    const recipesWithUrl = await Promise.all(recipes.map(async (r) => {
      let imageUrl = r.image;
      if (r.imageStorageId) {
        const url = await ctx.storage.getUrl(r.imageStorageId);
        if (url) imageUrl = url;
      }
      return { ...r, image: imageUrl };
    }));

    if (args.includeIngredients === false) {
      return recipesWithUrl.map(r => ({ ...r, ingredients: undefined }));
    }

    return recipesWithUrl;
  },
});

// List lightweight recipe previews for persistent list UIs.
// Deliberately excludes ingredients and instructions to keep subscriptions cheap.
export const listPreviews = query({
  args: {
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    favoritesOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    let recipes;
    if (args.favoritesOnly) {
      recipes = await ctx.db
        .query("recipes")
        .withIndex("by_favorite", (q) => q.eq("userId", userId).eq("isFavorite", true))
        .collect();
    } else if (args.category) {
      const category = args.category;
      recipes = await ctx.db
        .query("recipes")
        .withIndex("by_category", (q) => q.eq("userId", userId).eq("category", category))
        .collect();
    } else {
      recipes = await ctx.db
        .query("recipes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }

    if (args.search) {
      const lowerQuery = args.search.toLowerCase();
      recipes = recipes.filter(r => r.title.toLowerCase().includes(lowerQuery));
    }

    return await Promise.all(recipes.map(async (r) => {
      let imageUrl = r.image;
      if (r.imageStorageId) {
        const url = await ctx.storage.getUrl(r.imageStorageId);
        if (url) imageUrl = url;
      }

      return {
        _id: r._id,
        _creationTime: r._creationTime,
        title: r.title,
        category: r.category,
        image: imageUrl,
        imageAlt: r.imageAlt,
        imageBlurhash: r.imageBlurhash,
        imageWidth: r.imageWidth,
        imageHeight: r.imageHeight,
        imageAspectRatio: r.imageAspectRatio,
        sourceImageUrl: r.sourceImageUrl,
        prepTimeMinutes: r.prepTimeMinutes,
        difficulty: r.difficulty,
        portions: r.portions,
        isFavorite: r.isFavorite,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    }));
  },
});

// List all recipe IDs for current user
export const listIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return recipes.map(r => r._id);
  },
});

// List recipes with pagination support
export const listPaginated = query({
  args: {
    includeIngredients: v.optional(v.boolean()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const limit = args.limit ?? 30;

    let recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (args.search) {
      const lowerQuery = args.search.toLowerCase();
      recipes = recipes.filter(r => r.title.toLowerCase().includes(lowerQuery));
    }

    const hasMore = recipes.length > limit;
    const paginatedRecipes = recipes.slice(0, limit);

    const recipesWithUrl = await Promise.all(paginatedRecipes.map(async (r) => {
      let imageUrl = r.image;
      if (r.imageStorageId) {
        const url = await ctx.storage.getUrl(r.imageStorageId);
        if (url) imageUrl = url;
      }
      return { ...r, image: imageUrl };
    }));

    if (args.includeIngredients === false) {
      return {
        recipes: recipesWithUrl.map(r => ({ ...r, ingredients: undefined })),
        hasMore,
        total: recipes.length,
      };
    }

    return { recipes: recipesWithUrl, hasMore, total: recipes.length };
  },
});

// Get recipe by source URL (for deduplication)
export const getBySourceUrl = query({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_user_sourceUrl", (q) =>
        q.eq("userId", userId).eq("sourceUrl", args.url)
      )
      .first();
    return recipe ? recipe._id : null;
  },
});

export const getBySourceUrlForUser = internalQuery({
  args: { userId: v.id("users"), url: v.string() },
  handler: (ctx, args) => ctx.db.query("recipes")
    .withIndex("by_user_sourceUrl", (q) => q.eq("userId", args.userId).eq("sourceUrl", args.url))
    .first(),
});

export const getForUser = internalQuery({
  args: { userId: v.id("users"), id: v.id("recipes") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.id);
    return recipe?.userId === args.userId ? recipe : null;
  },
});

export const attachProxiedImage = internalMutation({
  args: {
    userId: v.id("users"),
    recipeId: v.id("recipes"),
    storageId: v.id("_storage"),
    imageUrl: v.string(),
    sourceImageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe || recipe.userId !== args.userId) throw new Error("RECIPE_NOT_OWNED");
    if (recipe.imageStorageId) return false;

    await claimRecipeAsset(ctx, args.userId, args.storageId, args.recipeId);
    await ctx.db.patch(args.recipeId, {
      imageStorageId: args.storageId,
      image: args.imageUrl,
      sourceImageUrl: args.sourceImageUrl,
      updatedAt: Date.now(),
    });
    return true;
  },
});

// Get single recipe by ID
export const get = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.userId !== userId) return null;

    if (recipe.imageStorageId) {
      const url = await ctx.storage.getUrl(recipe.imageStorageId);
      if (url) return { ...recipe, image: url };
    }
    return recipe;
  },
});

// Get category stats
export const getCategoryStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const categoryMap = new Map<string, number>();
    recipes.forEach(recipe => {
      categoryMap.set(recipe.category, (categoryMap.get(recipe.category) || 0) + 1);
    });

    const categories = Array.from(categoryMap.entries()).map(([name, count]) => ({
      name,
      count,
      image: undefined,
    }));

    return { total: recipes.length, categories };
  },
});

export const getCategories = getCategoryStats;

// Create new recipe
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    prepTimeMinutes: v.number(),
    difficulty: v.union(v.literal("Einfach"), v.literal("Mittel"), v.literal("Schwer")),
    portions: v.number(),
    ingredients: v.array(
      v.object({
        name: v.string(),
        amount: v.optional(v.string()),
        checked: v.optional(v.boolean()),
      })
    ),
    instructions: v.array(
      v.object({
        text: v.string(),
        icon: v.optional(v.string()),
      })
    ),
    tags: v.optional(v.array(v.string())),
    image: v.optional(v.string()),
    imageAlt: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    imageBlurhash: v.optional(v.string()),
    imageWidth: v.optional(v.number()),
    imageHeight: v.optional(v.number()),
    imageAspectRatio: v.optional(v.number()),
    sourceImageUrl: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    isFavorite: v.optional(v.boolean()),
    importOperationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    // Feature-Typ bestimmen
    let featureType: "manual_recipes" | "link_imports" | "photo_scans";
    if (args.sourceUrl) {
      featureType = "link_imports";
    } else if (args.sourceImageUrl) {
      featureType = "photo_scans";
    } else {
      featureType = "manual_recipes";
    }

    // User laden und Subscription prüfen
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("NOT_AUTHENTICATED");

    if (args.importOperationId) {
      const operation = await ctx.db.query("importOperations")
        .withIndex("by_user_operation", (q) => q.eq("userId", userId).eq("operationId", args.importOperationId!))
        .unique();
      if (!operation || operation.status !== "succeeded" || operation.feature !== "photo_scans" || !operation.resultDraft) {
        throw new Error("INVALID_IMPORT_OPERATION");
      }
      if (operation.resultRecipeId) return operation.resultRecipeId;
      const recipeId = await insertRecipe(ctx, userId, args);
      await adjustCategoryCount(ctx, args.category, 1, userId);
      await ensureCategoryExists(ctx, args.category, userId);
      await ctx.db.patch(operation._id, { resultRecipeId: recipeId, resultDraft: undefined, updatedAt: Date.now() });
      return recipeId;
    }

    if (featureType === "manual_recipes") {
      const recipeId = await insertRecipe(ctx, userId, args);
      await adjustCategoryCount(ctx, args.category, 1, userId);
      await ensureCategoryExists(ctx, args.category, userId);
      return recipeId;
    }

    // Pro User: kein Limit
    if ((user.subscription ?? "free") !== "free") {
      const recipeId = await insertRecipe(ctx, userId, args);
      await adjustCategoryCount(ctx, args.category, 1, userId);
      await ensureCategoryExists(ctx, args.category, userId);
      return recipeId;
    }

    // Free User: Limit prüfen
    const stats = user.usageStats || {
      manualRecipes: 0, linkImports: 0, photoScans: 0,
      subscriptionStartDate: undefined, subscriptionEndDate: undefined, resetOnDowngrade: false,
    };

    let currentCount: number;
    let limit: number;
    switch (featureType) {
      case "link_imports":
        currentCount = stats.linkImports || 0;
        limit = FREE_LIMITS.LINK_IMPORTS;
        break;
      case "photo_scans":
        currentCount = stats.photoScans || 0;
        limit = FREE_LIMITS.PHOTO_SCANS;
        break;
    }

    if (currentCount >= limit) {
      throw new Error(JSON.stringify({
        type: "LIMIT_REACHED",
        feature: featureType,
        current: currentCount,
        limit,
        message: getLimitMessage(featureType, limit),
      }));
    }

    const recipeId = await insertRecipe(ctx, userId, args);

    await ctx.runMutation(internal.users.incrementUsageCounter, {
      userId,
      feature: featureType,
    });

    await adjustCategoryCount(ctx, args.category, 1, userId);
    await ensureCategoryExists(ctx, args.category, userId);

    return recipeId;
  },
});

// Helper: Rezept in DB einfügen
export async function insertRecipe(ctx: any, userId: Id<"users">, args: any): Promise<any> {
  const ingredientsWithChecked = args.ingredients.map((ing: any) => ({
    ...ing,
    checked: ing.checked ?? false,
  }));

  const now = Date.now();
  const recipeId = await ctx.db.insert("recipes", {
    userId,
    title: args.title,
    description: args.description,
    category: args.category,
    prepTimeMinutes: args.prepTimeMinutes,
    difficulty: args.difficulty,
    portions: args.portions,
    ingredients: ingredientsWithChecked,
    instructions: args.instructions,
    tags: args.tags,
    isFavorite: args.isFavorite ?? false,
    image: args.image,
    imageAlt: args.imageAlt,
    imageStorageId: args.imageStorageId,
    imageBlurhash: args.imageBlurhash,
    imageWidth: args.imageWidth,
    imageHeight: args.imageHeight,
    imageAspectRatio: args.imageAspectRatio,
    sourceImageUrl: args.sourceImageUrl,
    sourceUrl: args.sourceUrl,
    createdAt: now,
    updatedAt: now,
  });
  if (args.imageStorageId) await claimRecipeAsset(ctx, userId, args.imageStorageId, recipeId);
  const user = await ctx.db.get(userId);
  if (user) {
    await ctx.db.patch(userId, {
      firstRecipeAt: user.firstRecipeAt ?? now,
      lastRecipeAt: now,
      lifecycleStage: "engaged",
      updatedAt: now,
    });
    await storeAnalyticsEvent(ctx, {
      eventId: `recipe:${recipeId}:saved`,
      name: "recipe_saved",
      version: 1,
      userId,
      billingUserId: user.billingUserId,
      operationId: args.importOperationId,
      correlationId: args.importOperationId,
      platform: "server",
      properties: {
        recipeId: String(recipeId),
        source: args.sourceUrl ? "link" : args.sourceImageUrl ? "photo_scan" : "manual",
        category: args.category,
        hasImage: Boolean(args.image || args.imageStorageId),
        ingredientCount: args.ingredients.length,
        instructionCount: args.instructions.length,
      },
      occurredAt: now,
    });
  }
  return recipeId;
}

function getLimitMessage(
  feature: "manual_recipes" | "link_imports" | "photo_scans",
  limit: number
): string {
  const messages = {
    manual_recipes: "Manuelle Rezepte sind unbegrenzt.",
    link_imports: `Du hast dein Limit von ${limit} Link-Imports erreicht.`,
    photo_scans: `Du hast dein Limit von ${limit} Foto-Scans erreicht.`,
  };
  return messages[feature];
}

// Update recipe
export const update = mutation({
  args: {
    id: v.id("recipes"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    prepTimeMinutes: v.optional(v.number()),
    difficulty: v.optional(v.union(v.literal("Einfach"), v.literal("Mittel"), v.literal("Schwer"))),
    portions: v.optional(v.number()),
    ingredients: v.optional(
      v.array(v.object({ name: v.string(), amount: v.optional(v.string()), checked: v.optional(v.boolean()) }))
    ),
    image: v.optional(v.string()),
    imageAlt: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    clearImageStorageId: v.optional(v.boolean()),
    clearImageMetadata: v.optional(v.boolean()),
    imageBlurhash: v.optional(v.string()),
    imageWidth: v.optional(v.number()),
    imageHeight: v.optional(v.number()),
    imageAspectRatio: v.optional(v.number()),
    sourceImageUrl: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    isFavorite: v.optional(v.boolean()),
    instructions: v.optional(
      v.array(v.object({ text: v.string(), icon: v.optional(v.string()) }))
    ),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.userId !== userId) throw new Error("Recipe not found or access denied");

    const {
      id: recipeId,
      ingredients,
      image,
      imageStorageId,
      clearImageStorageId,
      clearImageMetadata,
      imageWidth,
      imageHeight,
      imageAspectRatio,
      ...otherUpdates
    } = args;
    const shouldClearImageStorageId = clearImageStorageId === true;
    const shouldClearImageMetadata = clearImageMetadata === true;

    const replacesImage = imageStorageId !== undefined && imageStorageId !== recipe.imageStorageId;
    if (replacesImage) await claimRecipeAsset(ctx, userId, imageStorageId, recipeId);

    const updates: Record<string, unknown> = { ...otherUpdates, updatedAt: Date.now() };

    if (image !== undefined && image.trim() !== '' && !image.startsWith('blob:')) {
      updates.image = image;
    }
    if (imageStorageId !== undefined) updates.imageStorageId = imageStorageId;
    if (imageWidth !== undefined) updates.imageWidth = imageWidth;
    if (imageHeight !== undefined) updates.imageHeight = imageHeight;
    if (imageAspectRatio !== undefined) updates.imageAspectRatio = imageAspectRatio;

    if (ingredients) {
      updates.ingredients = ingredients.map(ing => ({ ...ing, checked: ing.checked ?? false }));
    }

    if (args.category && args.category !== recipe.category) {
      await adjustCategoryCount(ctx, recipe.category, -1, userId);
      await adjustCategoryCount(ctx, args.category, 1, userId);
      await ensureCategoryExists(ctx, args.category, userId);
    }

    if (shouldClearImageStorageId || shouldClearImageMetadata) {
      const recipeDoc = { ...recipe } as Record<string, unknown>;
      delete recipeDoc._id;
      delete recipeDoc._creationTime;
      const replacement: Record<string, unknown> = { ...recipeDoc, ...updates };
      if (shouldClearImageStorageId) {
        delete (replacement as { imageStorageId?: unknown }).imageStorageId;
      }
      if (shouldClearImageMetadata) {
        delete (replacement as { imageWidth?: unknown }).imageWidth;
        delete (replacement as { imageHeight?: unknown }).imageHeight;
        delete (replacement as { imageAspectRatio?: unknown }).imageAspectRatio;
      }
      await ctx.db.replace(recipeId, replacement as any);
    } else {
      await ctx.db.patch(recipeId, updates);
    }

    if (recipe.imageStorageId && (shouldClearImageStorageId || replacesImage)) {
      try {
        if (!await deleteTrackedAsset(ctx, userId, recipe.imageStorageId)) {
          await ctx.storage.delete(recipe.imageStorageId);
        }
      } catch (e) {
        console.warn('Could not delete old storage file:', e);
      }
    }
  },
});

// Delete recipe
export const deleteRecipe = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.userId !== userId) throw new Error("Recipe not found or access denied");

    if (recipe.imageStorageId) {
      try {
        if (!await deleteTrackedAsset(ctx, userId, recipe.imageStorageId)) {
          await ctx.storage.delete(recipe.imageStorageId);
        }
      } catch (e) {
        console.warn(`[Cleanup] Could not delete image storage file:`, e);
      }
    }

    await adjustCategoryCount(ctx, recipe.category, -1, userId);
    await ctx.db.delete(args.id);
  },
});

// Delete multiple recipes
export const deleteRecipes = mutation({
  args: { ids: v.array(v.id("recipes")) },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    for (const id of args.ids) {
      const recipe = await ctx.db.get(id);
      if (recipe && recipe.userId === userId) {
        if (recipe.imageStorageId) {
          try {
            if (!await deleteTrackedAsset(ctx, userId, recipe.imageStorageId)) {
              await ctx.storage.delete(recipe.imageStorageId);
            }
          } catch (e) {
            console.warn(`[Batch Cleanup] Could not delete image:`, e);
          }
        }
        await adjustCategoryCount(ctx, recipe.category, -1, userId);
        await ctx.db.delete(id);
      }
    }
  },
});

export const remove = deleteRecipe;

// Toggle favorite
export const toggleFavorite = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.userId !== userId) throw new Error("Recipe not found or access denied");
    await ctx.db.patch(args.id, { isFavorite: !recipe.isFavorite });
  },
});

// Get favorite recipes
export const getFavorites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_favorite", (q) => q.eq("userId", userId).eq("isFavorite", true))
      .collect();

    return await Promise.all(recipes.map(async (r) => {
      let imageUrl = r.image;
      if (r.imageStorageId) {
        const url = await ctx.storage.getUrl(r.imageStorageId);
        if (url) imageUrl = url;
      }
      return { ...r, image: imageUrl };
    }));
  },
});

// Get favorite recipe IDs
export const getFavoritesIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_favorite", (q) => q.eq("userId", userId).eq("isFavorite", true))
      .collect();
    return recipes.map(r => r._id);
  },
});

// Get recipe IDs in weekly plan
export const getWeeklyListIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    const weeklyMeals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .collect();

    const recipeIds = new Set<string>();
    for (const meal of weeklyMeals) recipeIds.add(meal.recipeId);
    return Array.from(recipeIds);
  },
});

// Backfill Category Stats
export const backfillCategoryStats = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);

    const existingStats = await ctx.db
      .query("categoryStats")
      .withIndex("by_user_category", (q) => q.eq("userId", userId))
      .collect();
    for (const stat of existingStats) await ctx.db.delete(stat._id);

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const counts = new Map<string, number>();
    for (const recipe of recipes) {
      counts.set(recipe.category, (counts.get(recipe.category) || 0) + 1);
    }

    const userCategories = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const maxOrder = userCategories.length > 0
      ? Math.max(...userCategories.map(c => c.order))
      : 0;

    let order = maxOrder + 1;
    for (const [category, count] of counts.entries()) {
      await ctx.db.insert("categoryStats", { userId, category, count });

      const existing = await ctx.db
        .query("categories")
        .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", category))
        .first();

      if (!existing) {
        await ctx.db.insert("categories", {
          userId,
          name: category,
          icon: "restaurant",
          color: "#6366f1",
          order: order++,
          isActive: true,
        });
      }
    }

    return { success: true, processed: recipes.length, categories: counts.size };
  },
});

// Seed Data Import
export const importSeedData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);

    const existingRecipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (existingRecipes.length > 0) {
      return { success: false, message: "Data already exists" };
    }

    const seedModule = await import("../data/seed");
    const { SEED_DATA } = seedModule;
    const now = Date.now();

    for (const recipe of SEED_DATA) {
      await ctx.db.insert("recipes", {
        userId,
        title: recipe.title,
        category: recipe.category,
        image: recipe.image,
        imageAlt: recipe.imageAlt,
        prepTimeMinutes: recipe.prepTimeMinutes,
        difficulty: recipe.difficulty as "Einfach" | "Mittel" | "Schwer",
        portions: recipe.portions,
        isFavorite: recipe.isFavorite,
        ingredients: recipe.ingredients.map((ing: any) => ({ ...ing, checked: false })),
        instructions: recipe.instructions,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true, imported: SEED_DATA.length };
  },
});

// Frontend Compatibility Aliases
export const createFromAI = create;
export const updateRecipe = update;

// Delete a storage file
export const deleteStorageFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const ownsImage = recipes.some(r => r.imageStorageId === args.storageId);
    if (!ownsImage) throw new Error("Not authorized to delete this file");

    try {
      if (!await deleteTrackedAsset(ctx, userId, args.storageId)) {
        await ctx.storage.delete(args.storageId);
      }
    } catch (e) {
      console.warn('Storage file already deleted or not found:', e);
    }
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const ownsImage = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("imageStorageId"), args.storageId))
      .first();
    if (!ownsImage) {
      throw new Error("Not authorized");
    }
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const cleanupPollinationsApiKeys = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    updated: v.number(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const batchSize = Math.min(Math.max(args.batchSize ?? 500, 1), 2000);
    const recipes = await ctx.db.query("recipes").take(batchSize);
    let updated = 0;

    for (const recipe of recipes) {
      const nextImage = stripPollinationsApiKeyFromUrl(recipe.image);
      const nextSourceImageUrl = stripPollinationsApiKeyFromUrl(recipe.sourceImageUrl);
      const patch: { image?: string; sourceImageUrl?: string } = {};

      if (nextImage !== recipe.image && nextImage !== undefined) {
        patch.image = nextImage;
      }
      if (nextSourceImageUrl !== recipe.sourceImageUrl && nextSourceImageUrl !== undefined) {
        patch.sourceImageUrl = nextSourceImageUrl;
      }

      if (Object.keys(patch).length > 0) {
        updated++;
        if (!dryRun) {
          await ctx.db.patch(recipe._id, patch);
        }
      }
    }

    return { scanned: recipes.length, updated };
  },
});
