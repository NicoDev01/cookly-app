import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { FREE_LIMITS } from "./constants";

// Helper-Funktion: Authentifizierte Clerk ID abrufen
async function getAuthenticatedClerkId(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}

// Helper-Funktion: Kategorie-Statistiken aktualisieren
async function adjustCategoryCount(ctx: any, category: string, amount: number, clerkId: string) {
  const existing = await ctx.db
    .query("categoryStats")
    .withIndex("by_user_category", (q: any) => q.eq("clerkId", clerkId).eq("category", category))
    .first();

  if (existing) {
    const newCount = Math.max(0, existing.count + amount);
    if (newCount === 0) {
      // Delete categoryStats entry
      await ctx.db.delete(existing._id);

      // Also delete from categories table if it exists
      const categoryEntry = await ctx.db
        .query("categories")
        .withIndex("by_user_name", (q: any) => q.eq("clerkId", clerkId).eq("name", category))
        .first();

      if (categoryEntry) {
        // Delete storage image if present (non-fatal)
        if (categoryEntry.imageStorageId) {
          try {
            await ctx.storage.delete(categoryEntry.imageStorageId);
          } catch (e) {
            console.warn(`[adjustCategoryCount] Could not delete category image:`, e);
          }
        }

        // Delete the category entry
        await ctx.db.delete(categoryEntry._id);
      }
    } else {
      await ctx.db.patch(existing._id, { count: newCount });
    }
  } else if (amount > 0) {
    await ctx.db.insert("categoryStats", {
      clerkId,
      category,
      count: amount,
    });
  }
}

// Helper-Funktion: Stelle sicher, dass Kategorie in categories Tabelle existiert (mit clerkId!)
async function ensureCategoryExists(ctx: any, category: string, clerkId: string) {
  const existing = await ctx.db
    .query("categories")
    .withIndex("by_user_name", (q: any) => q.eq("clerkId", clerkId).eq("name", category))
    .first();

  if (existing) {
    return; // Kategorie existiert bereits
  }

  // Max order für diesen User finden
  const userCategories = await ctx.db
    .query("categories")
    .withIndex("by_user", (q: any) => q.eq("clerkId", clerkId))
    .collect();

  const maxOrder = userCategories.length > 0
    ? Math.max(...userCategories.map((c: any) => c.order))
    : 0;

  // Neue Kategorie erstellen (MIT clerkId!)
  await ctx.db.insert("categories", {
    clerkId,
    name: category,
    icon: "restaurant",
    color: "#6366f1",
    order: maxOrder + 1,
    isActive: true,
  });

  console.log(`[ensureCategoryExists] ✅ Created category "${category}" for user ${clerkId}`);
}

// List all recipes for current user (legacy - returns array directly)
export const list = query({
  args: {
    includeIngredients: v.optional(v.boolean()),
    search: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    let recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();

    // Filter by category if provided
    if (args.category) {
      recipes = recipes.filter(r => r.category === args.category);
    }

    if (args.search) {
      const lowerQuery = args.search.toLowerCase();
      recipes = recipes.filter(r =>
        r.title.toLowerCase().includes(lowerQuery)
      );
    }

    // Map recipes to include storage URL if available
    const recipesWithUrl = await Promise.all(recipes.map(async (r) => {
      let imageUrl = r.image;
      if (r.imageStorageId) {
         const url = await ctx.storage.getUrl(r.imageStorageId);
         if (url) imageUrl = url;
      }
      return { ...r, image: imageUrl };
    }));

     if (args.includeIngredients === false) {
      return recipesWithUrl.map(r => ({
        ...r,
        ingredients: undefined,
      }));
    }

    return recipesWithUrl;
  },
});

// List all recipe IDs for current user (for navigation)
export const listIds = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
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
    const clerkId = await getAuthenticatedClerkId(ctx);
    const limit = args.limit ?? 30;

    let recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();

    if (args.search) {
      const lowerQuery = args.search.toLowerCase();
      recipes = recipes.filter(r =>
        r.title.toLowerCase().includes(lowerQuery)
      );
    }

    const hasMore = recipes.length > limit;
    const paginatedRecipes = recipes.slice(0, limit);

    // Map recipes to include storage URL if available
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
        recipes: recipesWithUrl.map(r => ({
          ...r,
          ingredients: undefined,
        })),
        hasMore,
        total: recipes.length,
      };
    }

    return {
      recipes: recipesWithUrl,
      hasMore,
      total: recipes.length,
    };
  },
});

// Get recipe by source URL (for deduplication) - User-scoped for Multi-Tenant isolation
export const getBySourceUrl = query({
  args: { 
    url: v.string(),
    clerkId: v.string()
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_user_sourceUrl", (q) => 
        q.eq("clerkId", args.clerkId).eq("sourceUrl", args.url)
      )
      .first();
    return recipe ? recipe._id : null;
  },
});

// Get single recipe by ID
export const get = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const recipe = await ctx.db.get(args.id);

    if (!recipe || recipe.clerkId !== clerkId) {
      return null;
    }

    // Resolve storage URL if exists
    if (recipe.imageStorageId) {
      const url = await ctx.storage.getUrl(recipe.imageStorageId);
      if (url) {
        return { ...recipe, image: url };
      }
    }

    return recipe;
  },
});

// Get category stats
export const getCategoryStats = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();

    // Calculate stats
    const categoryMap = new Map<string, number>();
    recipes.forEach(recipe => {
      categoryMap.set(recipe.category, (categoryMap.get(recipe.category) || 0) + 1);
    });

    const categories = Array.from(categoryMap.entries()).map(([name, count]) => ({
      name,
      count,
      image: undefined,
    }));

    return {
      total: recipes.length,
      categories,
    };
  },
});

// Get categories (alias for frontend compatibility)
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
    // Image fields
    image: v.optional(v.string()),
    imageAlt: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    imageBlurhash: v.optional(v.string()),
    sourceImageUrl: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    isFavorite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // ============================================================
    // 1. Feature-Typ bestimmen
    // ============================================================
    let featureType: "manual_recipes" | "link_imports" | "photo_scans";

    if (args.sourceUrl) {
      // URL vorhanden = Link Import (Instagram/Website)
      featureType = "link_imports";
    } else if (args.sourceImageUrl) {
      // sourceImageUrl vorhanden = Foto Scan
      featureType = "photo_scans";
    } else {
      // Sonst = Manuelles Rezept
      featureType = "manual_recipes";
    }

    // ============================================================
    // 2. User laden und Subscription prüfen
    // ============================================================
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();

    if (!user) {
      throw new Error("NOT_AUTHENTICATED");
    }

    // ============================================================
    // 3. Pro User haben keine Limits
    // ============================================================
    if (user.subscription !== "free") {
      // Rezept erstellen (Counter nicht erhöhen für Pro)
      const recipeId = await insertRecipe(ctx, clerkId, args);
      await adjustCategoryCount(ctx, args.category, 1, clerkId);
      await ensureCategoryExists(ctx, args.category, clerkId); // <-- CRITICAL: Kategorie mit clerkId erstellen!
      return recipeId;
    }

    // ============================================================
    // 4. Free User: Limit prüfen
    // ============================================================
    const stats = user.usageStats || {
      manualRecipes: 0,
      linkImports: 0,
      photoScans: 0,
      subscriptionStartDate: undefined,
      subscriptionEndDate: undefined,
      resetOnDowngrade: false,
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
      // Strukturierter Error für Frontend
      const errorData = {
        type: "LIMIT_REACHED",
        feature: featureType,
        current: currentCount,
        limit: limit,
        message: getLimitMessage(featureType, limit),
      };
      throw new Error(JSON.stringify(errorData));
    }

    // ============================================================
    // 5. Rezept erstellen (CRITICAL: Erst insert, dann Counter erhöhen!)
    // ============================================================
    try {
      const recipeId = await insertRecipe(ctx, clerkId, args);

      // ============================================================
      // 6. Counter erhöhen (NUR nach erfolgreichem Insert!)
      // ============================================================
      await ctx.runMutation(internal.users.incrementUsageCounter, {
        clerkId,
        feature: featureType,
      });

      // ============================================================
      // 7. Category Stats aktualisieren + Kategorie in Tabelle erstellen
      // ============================================================
      await adjustCategoryCount(ctx, args.category, 1, clerkId);
      await ensureCategoryExists(ctx, args.category, clerkId); // <-- CRITICAL: Kategorie mit clerkId erstellen!

      return recipeId;

    } catch (error) {
      // Insert fehlgeschlagen -> Counter wurde NICHT erhöht (korrekt!)
      throw error;
    }
  },
});

// ============================================================
// HELPER - Recipe Insert
// ============================================================
async function insertRecipe(
  ctx: any,
  clerkId: string,
  args: any
): Promise<any> {
  const ingredientsWithChecked = args.ingredients.map((ing: any) => ({
    ...ing,
    checked: ing.checked ?? false,
  }));

  const now = Date.now();
  return await ctx.db.insert("recipes", {
    clerkId,
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
    sourceImageUrl: args.sourceImageUrl,
    sourceUrl: args.sourceUrl,
    createdAt: now,
    updatedAt: now,
  });
}

// ============================================================
// HELPER - Error Message
// ============================================================
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
      v.array(
        v.object({
          name: v.string(),
          amount: v.optional(v.string()),
          checked: v.optional(v.boolean()),
        })
      )
    ),
    // Image fields
    image: v.optional(v.string()),
    imageAlt: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    imageBlurhash: v.optional(v.string()),
    sourceImageUrl: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    isFavorite: v.optional(v.boolean()),
    instructions: v.optional(
      v.array(
        v.object({
          text: v.string(),
          icon: v.optional(v.string()),
        })
      )
    ),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.clerkId !== clerkId) {
      throw new Error("Recipe not found or access denied");
    }

    const { id, ingredients, image, imageStorageId, ...otherUpdates } = args;

    // STORAGE CLEANUP: Wenn neue imageStorageId übergeben wird, alte löschen
    if (imageStorageId && recipe.imageStorageId && recipe.imageStorageId !== imageStorageId) {
      // Altes Bild aus Storage löschen (mit Fehlerbehandlung falls ID nicht existiert)
      try {
        await ctx.storage.delete(recipe.imageStorageId);
      } catch (e) {
        console.warn('Could not delete old storage file:', e);
        // Nicht fatal, mit update fortfahren
      }
    }

    // BILD-LOGIK: Nur updaten wenn Bild sich tatsächlich geändert hat
    const updates: Record<string, unknown> = { ...otherUpdates, updatedAt: Date.now() };

    // image nur updaten wenn explizit übergeben UND nicht leer
    if (image !== undefined) {
      // Wenn image leeren String oder nur whitespace, NICHT updaten (bleibt wie es ist)
      if (image.trim() !== '' && !image.startsWith('blob:')) {
        updates.image = image;
      }
      // Wenn image leer ist, nichts tun (Bild behalten)
    }

    // imageStorageId nur updaten wenn übergeben
    if (imageStorageId !== undefined) {
      updates.imageStorageId = imageStorageId;
    }

    if (ingredients) {
      updates.ingredients = ingredients.map(ing => ({
        ...ing,
        checked: ing.checked ?? false,
      }));
    }

    // Handle category stats update if category changed
    if (args.category && args.category !== recipe.category) {
      await adjustCategoryCount(ctx, recipe.category, -1, clerkId);
      await adjustCategoryCount(ctx, args.category, 1, clerkId);
      await ensureCategoryExists(ctx, args.category, clerkId); // <-- CRITICAL: Neue Kategorie mit clerkId erstellen!
    }

    await ctx.db.patch(args.id, updates);
  },
});

// Delete recipe
export const deleteRecipe = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // 1. Identifikation & Berechtigungsprüfung
    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.clerkId !== clerkId) {
      throw new Error("Recipe not found or access denied");
    }

    // 2. Foto-Löschung (File Storage) - Aufräumen von Dateileichen
    if (recipe.imageStorageId) {
      try {
        await ctx.storage.delete(recipe.imageStorageId);
      } catch (e) {
        console.warn(`[Cleanup] Could not delete image storage file ${recipe.imageStorageId}:`, e);
      }
    }

    // 3. Kategorie-Statistiken aktualisieren
    await adjustCategoryCount(ctx, recipe.category, -1, clerkId);

    // 4. Datenbank-Eintrag löschen
    await ctx.db.delete(args.id);
  },
});

// Delete multiple recipes
export const deleteRecipes = mutation({
  args: { ids: v.array(v.id("recipes")) },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    for (const id of args.ids) {
      const recipe = await ctx.db.get(id);
      if (recipe && recipe.clerkId === clerkId) {
        // 1. Storage Cleanup
        if (recipe.imageStorageId) {
          try {
            await ctx.storage.delete(recipe.imageStorageId);
          } catch (e) {
            console.warn(`[Batch Cleanup] Could not delete image ${recipe.imageStorageId}:`, e);
          }
        }

        // 2. Stats Adjustment
        await adjustCategoryCount(ctx, recipe.category, -1, clerkId);

        // 3. Document Deletion
        await ctx.db.delete(id);
      }
    }
  },
});

// Alias for compatibility
export const remove = deleteRecipe;

// Toggle favorite
export const toggleFavorite = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.clerkId !== clerkId) {
      throw new Error("Recipe not found or access denied");
    }

    await ctx.db.patch(args.id, {
      isFavorite: !recipe.isFavorite,
    });
  },
});

// Get favorite recipes
export const getFavorites = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_favorite", (q) =>
        q.eq("clerkId", clerkId).eq("isFavorite", true)
      )
      .collect();

    // Map recipes to include storage URL if available
    const recipesWithUrl = await Promise.all(recipes.map(async (r) => {
      let imageUrl = r.image;
      if (r.imageStorageId) {
         const url = await ctx.storage.getUrl(r.imageStorageId);
         if (url) imageUrl = url;
      }
      return { ...r, image: imageUrl };
    }));

    return recipesWithUrl;
  },
});

// Get favorite recipe IDs only
export const getFavoritesIds = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_favorite", (q) =>
        q.eq("clerkId", clerkId).eq("isFavorite", true)
      )
      .collect();

    return recipes.map(r => r._id);
  },
});

// Get recipe IDs that are in the weekly plan
export const getWeeklyListIds = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const weeklyMeals = await ctx.db
      .query("weeklyMeals")
      .withIndex("by_user_date", (q) => q.eq("clerkId", clerkId))
      .collect();

    // Extract unique recipe IDs
    const recipeIds = new Set<string>();
    for (const meal of weeklyMeals) {
      recipeIds.add(meal.recipeId);
    }

    return Array.from(recipeIds);
  },
});

// Backfill Category Stats (Migration helper)
export const backfillCategoryStats = mutation({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // Clear existing user stats to avoid duplication
    const existingStats = await ctx.db
      .query("categoryStats")
      .withIndex("by_user_category", (q) => q.eq("clerkId", clerkId))
      .collect();

    for (const stat of existingStats) {
      await ctx.db.delete(stat._id);
    }

    // Get all user recipes
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();

    // Count by category
    const counts = new Map<string, number>();
    for (const recipe of recipes) {
      const current = counts.get(recipe.category) || 0;
      counts.set(recipe.category, current + 1);
    }

    // Get max order for new categories
    const userCategories = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();
    const maxOrder = userCategories.length > 0
      ? Math.max(...userCategories.map((c) => c.order))
      : 0;

    // Write new stats AND create categories
    let order = maxOrder + 1;
    for (const [category, count] of counts.entries()) {
      // Create stats
      await ctx.db.insert("categoryStats", {
        clerkId,
        category,
        count
      });

      // Create category if not exists
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_user_name", (q) => q.eq("clerkId", clerkId).eq("name", category))
        .first();

      if (!existing) {
        await ctx.db.insert("categories", {
          clerkId,
          name: category,
          icon: "restaurant",
          color: "#6366f1",
          order: order++,
          isActive: true,
        });
        console.log(`[backfillCategoryStats] ✅ Created category "${category}" for user ${clerkId}`);
      }
    }

    return { success: true, processed: recipes.length, categories: counts.size };
  }
});

// Seed Data Import (for development/testing)
export const importSeedData = mutation({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // Check if data already exists
    const existingRecipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();

    if (existingRecipes.length > 0) {
      console.log("[Seed Data] Recipes already exist, skipping import");
      return { success: false, message: "Data already exists" };
    }

    // Import seed data
    const seedModule = await import("../data/seed");
    const { SEED_DATA } = seedModule;
    const now = Date.now();

    for (const recipe of SEED_DATA) {
      await ctx.db.insert("recipes", {
        clerkId,
        title: recipe.title,
        category: recipe.category,
        image: recipe.image,
        imageAlt: recipe.imageAlt,
        prepTimeMinutes: recipe.prepTimeMinutes,
        difficulty: recipe.difficulty as "Einfach" | "Mittel" | "Schwer",
        portions: recipe.portions,
        isFavorite: recipe.isFavorite,
        ingredients: recipe.ingredients.map((ing: any) => ({
          ...ing,
          checked: false,
        })),
        instructions: recipe.instructions,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log(`[Seed Data] Imported ${SEED_DATA.length} recipes for user ${clerkId}`);
    return { success: true, imported: SEED_DATA.length };
  },
});


// --- FRONTEND COMPATIBILITY LAYER ---

// Alias functions to match old frontend API
export const createFromAI = create;
export const updateRecipe = update;
export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Delete a storage file (for cleanup when replacing images)
export const deleteStorageFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // Verify this storage ID is associated with one of user's recipes
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();

    const ownsImage = recipes.some(r => r.imageStorageId === args.storageId);
    if (!ownsImage) {
      throw new Error("Not authorized to delete this file");
    }

    // Try to delete, but don't throw if file doesn't exist
    try {
      await ctx.storage.delete(args.storageId);
    } catch (e) {
      console.warn('Storage file already deleted or not found:', e);
      // Nicht fatal - Datei existiert vielleicht nicht mehr
    }
  },
});

// Get storage URL for a storage ID
export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Generate AI image URL (KEIN Download - URL funktioniert direkt!)
export const generateAndStoreAiImage = action({
  args: {
    recipeTitle: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // API Key aus Environment Variable holen
    const apiKey = process.env.POLLINATIONS_API_KEY || '';
    if (!apiKey) {
      throw new Error('POLLINATIONS_API_KEY not set. Please add it to your .env file.');
    }

    // Einfach die Pollinations URL generieren (kein Download nötig!)
    const { getConsistentSeed, buildRecipeImageUrl } = await import("./pollinationsHelper");
    const seed = getConsistentSeed(args.recipeTitle);

    const pollinationsUrl = buildRecipeImageUrl(args.recipeTitle, seed, apiKey);

    console.log(`[Recipe Image] ✅ Generated URL for "${args.recipeTitle}":`, pollinationsUrl);

    // URL direkt zurückgeben (kein Storage nötig)
    return { url: pollinationsUrl };
  },
});

// ============================================================
// IMAGE PROXY - Externe Bilder in Convex Storage speichern
// ============================================================
export const proxyExternalImage = action({
  args: {
    recipeId: v.id("recipes"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; imageStorageId?: Id<"storage">; imageUrl?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkId = identity.subject;

    // Rezept laden
    const recipe = await ctx.runQuery(api.recipes.get, { id: args.recipeId });
    if (!recipe || recipe.clerkId !== clerkId) {
      throw new Error("Recipe not found or access denied");
    }

    // Nur proxyen wenn sourceImageUrl existiert und noch nicht in Storage
    if (!recipe.sourceImageUrl || recipe.imageStorageId) {
      console.log('[proxyExternalImage] No proxy needed - recipe already has stored image or no source URL');
      return { success: false };
    }

    // Prüfen ob es eine Instagram-URL ist
    const isInstagram = recipe.sourceImageUrl.includes('cdninstagram.com') ||
                       recipe.sourceImageUrl.includes('instagram.com');

    if (!isInstagram) {
      console.log('[proxyExternalImage] Not an Instagram URL, skipping proxy:', recipe.sourceImageUrl);
      return { success: false };
    }

    try {
      console.log('[proxyExternalImage] Fetching Instagram image:', recipe.sourceImageUrl);

      // Bild server-side fetchen (ohne CORS-Beschränkungen)
      const response = await fetch(recipe.sourceImageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      // Bild als ArrayBuffer holen
      const imageBuffer = await response.arrayBuffer();
      const blob = new Blob([imageBuffer]);

      // In Convex Storage speichern
      const storageId = await ctx.storage.store(blob);

      // Rezept aktualisieren mit Storage ID
      await ctx.runMutation(api.recipes.update, {
        id: args.recipeId,
        imageStorageId: storageId,
        image: undefined, // image wird durch storage URL ersetzt
      });

      // Neue URL generieren
      const imageUrl = await ctx.storage.getUrl(storageId);

      console.log('[proxyExternalImage] ✅ Successfully proxied Instagram image:', {
        recipeId: args.recipeId,
        storageId,
        imageUrl,
      });

      return {
        success: true,
        imageStorageId: storageId,
        imageUrl: imageUrl || undefined,
      };

    } catch (error) {
      console.error('[proxyExternalImage] ❌ Failed to proxy image:', error);
      // Fehler ist nicht fatal - Rezept behält original URL
      return { success: false };
    }
  },
});

// Batch proxy für mehrere Rezepte (z.B. beim Initialisieren der WeeklyPage)
export const proxyExternalImages = action({
  args: {
    recipeIds: v.array(v.id("recipes")),
  },
  handler: async (ctx, args): Promise<{ proxied: number; failed: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    let proxied = 0;
    let failed = 0;

    for (const recipeId of args.recipeIds) {
      try {
        const result = await ctx.runAction(api.recipes.proxyExternalImage, { recipeId });
        if (result.success) {
          proxied++;
        }
      } catch (error) {
        console.error(`[proxyExternalImages] Failed for recipe ${recipeId}:`, error);
        failed++;
      }
    }

    console.log(`[proxyExternalImages] Batch complete: ${proxied} proxied, ${failed} failed`);
    return { proxied, failed };
  },
});



