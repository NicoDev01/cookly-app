import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { FREE_LIMITS } from "./constants";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

// Helper: Authentifizierten User laden (wirft wenn nicht eingeloggt)
async function getAuthenticatedUserId(ctx: any): Promise<Id<"users">> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) throw new Error("Not authenticated");
  const linkedUser = await ctx.db
    .query("users")
    .withIndex("by_authUserId", (q: any) => q.eq("authUserId", authUserId.toString()))
    .first();
  if (linkedUser) return linkedUser._id;

  const authUser = await ctx.db.get(authUserId as Id<"users">);
  if (authUser) return authUser._id;

  throw new Error("User not found");
}

// Helper: Kategorie-Statistiken aktualisieren
async function adjustCategoryCount(ctx: any, category: string, amount: number, userId: Id<"users">) {
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
            await ctx.storage.delete(categoryEntry.imageStorageId);
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
async function ensureCategoryExists(ctx: any, category: string, userId: Id<"users">) {
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
      case "manual_recipes":
        currentCount = stats.manualRecipes || 0;
        limit = FREE_LIMITS.MANUAL_RECIPES;
        break;
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

    try {
      const recipeId = await insertRecipe(ctx, userId, args);

      await ctx.runMutation(internal.users.incrementUsageCounter, {
        userId,
        feature: featureType,
      });

      await adjustCategoryCount(ctx, args.category, 1, userId);
      await ensureCategoryExists(ctx, args.category, userId);

      return recipeId;
    } catch (error) {
      throw error;
    }
  },
});

// Helper: Rezept in DB einfügen
async function insertRecipe(ctx: any, userId: Id<"users">, args: any): Promise<any> {
  const ingredientsWithChecked = args.ingredients.map((ing: any) => ({
    ...ing,
    checked: ing.checked ?? false,
  }));

  const now = Date.now();
  return await ctx.db.insert("recipes", {
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
}

function getLimitMessage(
  feature: "manual_recipes" | "link_imports" | "photo_scans",
  limit: number
): string {
  const messages = {
    manual_recipes: `Du hast dein Limit von ${limit} manuellen Rezepten erreicht.`,
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
      id,
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

    if (
      recipe.imageStorageId &&
      (shouldClearImageStorageId || (imageStorageId && recipe.imageStorageId !== imageStorageId))
    ) {
      try {
        await ctx.storage.delete(recipe.imageStorageId);
      } catch (e) {
        console.warn('Could not delete old storage file:', e);
      }
    }

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
      const { _id, _creationTime, ...recipeDoc } = recipe;
      const replacement: Record<string, unknown> = { ...recipeDoc, ...updates };
      if (shouldClearImageStorageId) {
        delete (replacement as { imageStorageId?: unknown }).imageStorageId;
      }
      if (shouldClearImageMetadata) {
        delete (replacement as { imageWidth?: unknown }).imageWidth;
        delete (replacement as { imageHeight?: unknown }).imageHeight;
        delete (replacement as { imageAspectRatio?: unknown }).imageAspectRatio;
      }
      await ctx.db.replace(args.id, replacement as any);
      return;
    }

    await ctx.db.patch(args.id, updates);
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
        await ctx.storage.delete(recipe.imageStorageId);
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
            await ctx.storage.delete(recipe.imageStorageId);
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

export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getAuthenticatedUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

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
      await ctx.storage.delete(args.storageId);
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

// Generate AI image URL
export const generateAndStoreAiImage = action({
  args: { recipeTitle: v.string() },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");

    const apiKey = process.env.POLLINATIONS_API_KEY || '';
    if (!apiKey) throw new Error('POLLINATIONS_API_KEY not set.');

    const { getConsistentSeed, buildRecipeImageUrl } = await import("./pollinationsHelper");
    const seed = getConsistentSeed(args.recipeTitle);
    const pollinationsUrl = buildRecipeImageUrl(args.recipeTitle, seed, apiKey);

    return { url: pollinationsUrl };
  },
});

// Proxy external image to Convex Storage
export const proxyExternalImage = action({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args): Promise<{ success: boolean; imageStorageId?: Id<"storage">; imageUrl?: string }> => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");

    const recipe = await ctx.runQuery(api.recipes.get, { id: args.recipeId });
    if (!recipe) throw new Error("Recipe not found or access denied");

    if (!recipe.sourceImageUrl || recipe.imageStorageId) {
      return { success: false };
    }

    const isInstagram = recipe.sourceImageUrl.includes('cdninstagram.com') ||
                        recipe.sourceImageUrl.includes('instagram.com');

    if (!isInstagram) return { success: false };

    try {
      const response = await fetch(recipe.sourceImageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });

      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

      const imageBuffer = await response.arrayBuffer();
      const blob = new Blob([imageBuffer]);
      const storageId = await ctx.storage.store(blob);

      await ctx.runMutation(api.recipes.update, {
        id: args.recipeId,
        imageStorageId: storageId,
        image: undefined,
      });

      const imageUrl = await ctx.storage.getUrl(storageId);
      return { success: true, imageStorageId: storageId, imageUrl: imageUrl || undefined };

    } catch (error) {
      console.error('[proxyExternalImage] ❌ Failed:', error);
      return { success: false };
    }
  },
});

// Batch proxy
export const proxyExternalImages = action({
  args: { recipeIds: v.array(v.id("recipes")) },
  handler: async (ctx, args): Promise<{ proxied: number; failed: number }> => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");

    let proxied = 0;
    let failed = 0;

    for (const recipeId of args.recipeIds) {
      try {
        const result = await ctx.runAction(api.recipes.proxyExternalImage, { recipeId });
        if (result.success) proxied++;
      } catch (error) {
        console.error(`[proxyExternalImages] Failed for recipe ${recipeId}:`, error);
        failed++;
      }
    }

    return { proxied, failed };
  },
});
