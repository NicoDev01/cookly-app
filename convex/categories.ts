import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { deleteTrackedAsset } from "./storageAssets";
import { getAuthenticatedUserId } from "./lib/authUser";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const result = await Promise.all(
      categories
        .sort((a, b) => a.order - b.order)
        .map(async (cat) => {
          let imageUrl: string | undefined;
          if (cat.imageUrl) {
            imageUrl = cat.imageUrl;
          } else if (cat.imageStorageId) {
            imageUrl = (await ctx.storage.getUrl(cat.imageStorageId)) ?? undefined;
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

export const getCategoriesWithStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const stats = await ctx.db
      .query("categoryStats")
      .withIndex("by_user_category", (q) => q.eq("userId", userId))
      .collect();

    const statsMap = new Map(stats.map(s => [s.category, s.count]));
    const categoriesMap = new Map(categories.map(cat => [cat.name, cat]));

    const allCategoryNames = new Set([
      ...categories.map(c => c.name),
      ...stats.map(s => s.category)
    ]);

    const result = await Promise.all(
      Array.from(allCategoryNames)
        .sort()
        .map(async (categoryName) => {
          const cat = categoriesMap.get(categoryName);

          let imageUrl: string | undefined;

          const previewRecipes = await ctx.db
            .query("recipes")
            .withIndex("by_category", (q) => q.eq("userId", userId).eq("category", categoryName))
            .take(4);

          const recipeImages = (
            await Promise.all(
              previewRecipes.map(async (recipe) => {
                let recipeImageUrl = recipe.image;
                if (recipe.imageStorageId) {
                  const url = await ctx.storage.getUrl(recipe.imageStorageId);
                  if (url) recipeImageUrl = url;
                }
                return recipeImageUrl;
              })
            )
          ).filter((image): image is string => typeof image === "string" && image.length > 0);

          imageUrl = recipeImages[0];

          if (!imageUrl && cat?.imageUrl) {
            imageUrl = cat.imageUrl;
          } else if (!imageUrl && cat?.imageStorageId) {
            imageUrl = (await ctx.storage.getUrl(cat.imageStorageId)) ?? undefined;
          }

          return {
            name: categoryName,
            icon: cat?.icon || "restaurant",
            color: cat?.color || "#6366f1",
            image: imageUrl,
            recipeImages,
            count: statsMap.get(categoryName) || 0,
          };
        })
    );

    return result.filter((category) => category.count > 0);
  },
});

export const deleteCategory = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", userId).eq("name", args.name)
      )
      .collect();

    if (categories.length === 0) throw new Error("Category not found");

    const category = categories[0];

    if (category.imageStorageId) {
      try {
        if (!await deleteTrackedAsset(ctx, userId, category.imageStorageId)) {
          await ctx.storage.delete(category.imageStorageId);
        }
      } catch (e) {
        console.warn(`[Delete Category] Could not delete storage image:`, e);
      }
    }

    await ctx.db.delete(category._id);
    console.log(`[Delete Category] ✅ Deleted category: ${args.name}`);
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const ownsImage = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("imageStorageId"), args.storageId))
      .first();
    if (!ownsImage) {
      throw new Error("Not authorized");
    }
    return await ctx.storage.getUrl(args.storageId);
  },
});
