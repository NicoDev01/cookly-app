import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

async function getAuthenticatedUserId(ctx: any): Promise<Id<"users">> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_authUserId", (q: any) => q.eq("authUserId", authUserId.toString()))
    .first();
  if (!user) throw new Error("User not found");
  return user._id;
}

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

          const firstRecipe = await ctx.db
            .query("recipes")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .filter((q) => q.eq(q.field("category"), categoryName))
            .first();

          if (firstRecipe) {
            imageUrl = firstRecipe.image;
            if (firstRecipe.imageStorageId) {
              const url = await ctx.storage.getUrl(firstRecipe.imageStorageId);
              if (url) imageUrl = url;
            }
          }

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
        await ctx.storage.delete(category.imageStorageId);
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
    return await ctx.storage.getUrl(args.storageId);
  },
});
