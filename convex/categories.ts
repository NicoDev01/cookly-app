import { query, mutation, internalMutation, action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

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
 * Prüft, ob ein Kategorie-Image bereits existiert (für aktuellen User)
 */
export const getExistingImageUrl = query({
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
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    if (categories.length === 0) {
      return null;
    }

    const category = categories[0];

    // Priorität: imageUrl > imageStorageId
    if (category.imageUrl) {
      return category.imageUrl;
    }

    if (category.imageStorageId) {
      return await ctx.storage.getUrl(category.imageStorageId);
    }

    return null;
  },
});

/**
 * Gibt alle Kategorien des Users mit Rezept-Anzahl zurück
 *
 * Erweiterung: Gibt auch Kategorien zurück die nur in categoryStats existieren
 * (für Kategorien die noch kein Bild in der categories Tabelle haben)
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

          let imageUrl: string | undefined;
          if (cat?.imageUrl) {
            imageUrl = cat.imageUrl;
          } else if (cat?.imageStorageId) {
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

    return result;
  },
});

/**
 * INTERNAL: Erstellt oder aktualisiert eine Kategorie mit Bild
 * clerkId wird als Argument übergeben (wie categoryStats)
 */
export const upsertCategoryWithImage = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    imageStorageId: v.id("_storage"),
    oldStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { clerkId, name, imageStorageId, oldStorageId } = args;

    if (oldStorageId && oldStorageId !== imageStorageId) {
      try {
        await ctx.storage.delete(oldStorageId);
      } catch (e) {
        console.warn('Could not delete old category image:', e);
      }
    }

    // Prüfe ob Kategorie für diesen User bereits existiert
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user_name", (q) =>
        q.eq("clerkId", clerkId).eq("name", name)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const category = categories[0];

    if (category) {
      await ctx.db.patch(category._id, {
        imageStorageId,
      });
      return { action: "updated", id: category._id };
    } else {
      // Max order für diesen User finden
      const userCategories = await ctx.db
        .query("categories")
        .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
        .collect();

      const maxOrder = userCategories.length > 0
        ? Math.max(...userCategories.map((c) => c.order))
        : 0;

      const newId = await ctx.db.insert("categories", {
        clerkId,
        name,
        icon: "restaurant",
        color: "#6366f1",
        imageStorageId,
        order: maxOrder + 1,
        isActive: true,
      });
      return { action: "created", id: newId };
    }
  },
});

/**
 * INTERNAL: Speichert Kategorie mit direkter URL
 * clerkId wird als Argument übergeben (wie categoryStats)
 */
export const upsertCategoryWithImageUrl = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const { clerkId, name, imageUrl } = args;

    // Prüfe ob Kategorie für diesen User bereits existiert
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user_name", (q) =>
        q.eq("clerkId", clerkId).eq("name", name)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const category = categories[0];

    if (category) {
      await ctx.db.patch(category._id, {
        imageUrl,
      });
      return { action: "updated", id: category._id };
    } else {
      // Max order für diesen User finden
      const userCategories = await ctx.db
        .query("categories")
        .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
        .collect();

      const maxOrder = userCategories.length > 0
        ? Math.max(...userCategories.map((c) => c.order))
        : 0;

      const newId = await ctx.db.insert("categories", {
        clerkId,
        name,
        icon: "restaurant",
        color: "#6366f1",
        imageUrl,
        order: maxOrder + 1,
        isActive: true,
      });
      return { action: "created", id: newId };
    }
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
 * Action: Generiert Pollinations-Bild URL (für aktuellen User)
 */
export const generateAndStoreCategoryImage = action({
  args: {
    categoryName: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkId = identity.subject;

    // Prüfe ob bereits eine URL existiert
    const existingUrl = await ctx.runQuery(api.categories.getExistingImageUrl, {
      name: args.categoryName,
    });

    if (existingUrl) {
      return { url: existingUrl };
    }

    // API Key aus Environment Variable holen
    const apiKey = process.env.POLLINATIONS_API_KEY || '';
    if (!apiKey) {
      throw new Error('POLLINATIONS_API_KEY not set. Please add it to your .env file.');
    }

    // Pollinations URL generieren
    const { getConsistentSeed, buildCategoryImageUrl } = await import("./pollinationsHelper");
    const seed = getConsistentSeed(args.categoryName);

    const pollinationsUrl = buildCategoryImageUrl(args.categoryName, seed, apiKey);

    console.log(`[Category Image] ✅ Generated URL for "${args.categoryName}":`, pollinationsUrl);

    // URL in Datenbank speichern (mit clerkId!)
    await ctx.runMutation(internal.categories.upsertCategoryWithImageUrl, {
      clerkId,
      name: args.categoryName,
      imageUrl: pollinationsUrl,
    });

    return { url: pollinationsUrl };
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
