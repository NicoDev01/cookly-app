import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Gibt alle Kategorien des aktuellen Users zurück (ohne Stats)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const clerkId = identity.subject;

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const result = await Promise.all(
      categories
        .sort((a, b) => a.order - b.order)
        .map(async (cat) => {
          let imageUrl: string | undefined;

          // Priorität: imageUrl > imageStorageId
          if (cat.imageUrl) {
            imageUrl = cat.imageUrl;
          } else if (cat.imageStorageId) {
            imageUrl = await ctx.storage.getUrl(cat.imageStorageId);
          }

          return {
            _id: cat._id,
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
            image: imageUrl,
            imageStorageId: cat.imageStorageId,
            imageUrl: cat.imageUrl,
            order: cat.order,
          };
        })
    );

    return result;
  },
});

/**
 * Gibt alle Kategorien des Users mit Rezept-Anzahl zurück
 *
 * Erweiterung: Gibt auch Kategorien zurück die nur in categoryStats existieren
 * (für Kategorien die noch kein Bild in der categories Tabelle haben)
 *
 * NEU: Kategorie-Bilder kommen vom ersten Rezept in der Kategorie
 */
export const getCategoriesWithStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const clerkId = identity.subject;

    // Alle aktiven Kategorien des Users laden
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Nutzer-spezifische Stats laden
    const stats = await ctx.db
      .query("categoryStats")
      .withIndex("by_user_category", (q) => q.eq("clerkId", clerkId))
      .collect();

    const statsMap = new Map(stats.map(s => [s.category, s.count]));

    // Map für Kategorien in der DB (für schnellen Lookup)
    const categoriesMap = new Map(categories.map(cat => [cat.name, cat]));

    // Alle Kategorien aus stats sammeln (auch die ohne DB-Eintrag)
    const allCategoryNames = new Set([
      ...categories.map(c => c.name),
      ...stats.map(s => s.category)
    ]);

    // Kategorien mit Stats zusammenführen
    const result = await Promise.all(
      Array.from(allCategoryNames)
        .sort()
        .map(async (categoryName) => {
          const cat = categoriesMap.get(categoryName);

          // NEU: Bild vom ersten Rezept in der Kategorie holen
          let imageUrl: string | undefined;
          
          // Erstes Rezept in dieser Kategorie finden
          const firstRecipe = await ctx.db
            .query("recipes")
            .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
            .filter((q) => q.eq(q.field("category"), categoryName))
            .first();

          if (firstRecipe) {
            // Recipe image resolution logic (wie in recipes.ts)
            imageUrl = firstRecipe.image;
            if (firstRecipe.imageStorageId) {
              const url = await ctx.storage.getUrl(firstRecipe.imageStorageId);
              if (url) imageUrl = url;
            }
          }

          // Fallback: Kategorie-eigenes Bild falls kein Rezept-Bild vorhanden
          if (!imageUrl && cat?.imageUrl) {
            imageUrl = cat.imageUrl;
          } else if (!imageUrl && cat?.imageStorageId) {
            imageUrl = await ctx.storage.getUrl(cat.imageStorageId);
          }

          return {
            name: categoryName,
            icon: cat?.icon || "restaurant",
            color: cat?.color || "#6366f1",
            image: imageUrl,
            count: statsMap.get(categoryName) || 0,
          };
        })
    );

    // Filter out categories with 0 recipes
    return result.filter((category) => category.count > 0);
  },
});

/**
 * Löscht eine Kategorie des aktuellen Users
 */
export const deleteCategory = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const clerkId = identity.subject;

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user_name", (q) =>
        q.eq("clerkId", clerkId).eq("name", args.name)
      )
      .collect();

    if (categories.length === 0) {
      throw new Error("Category not found");
    }

    const category = categories[0];

    // Bild aus Storage löschen falls vorhanden
    if (category.imageStorageId) {
      try {
        await ctx.storage.delete(category.imageStorageId);
      } catch (e) {
        console.warn(`[Delete Category] Could not delete storage image:`, e);
      }
    }

    await ctx.db.delete(category._id);
    console.log(`[Delete Category] ✅ Deleted category: ${args.name}`);
  },
});

/**
 * Gibt Storage-URL für eine Storage-ID zurück
 */
export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
