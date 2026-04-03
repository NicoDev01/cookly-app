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

export const getShoppingList = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q: any) => q.eq("authUserId", authUserId.toString()))
      .first();
    if (!user) return [];

    return await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
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

    const normalizedName = args.name.toLowerCase().trim();
    const normalizedAmount = args.amount?.toLowerCase().trim() || "";
    const key = `${normalizedName}|${normalizedAmount}`;

    const existing = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("shoppingItems", {
      userId,
      name: args.name,
      amount: args.amount,
      normalizedName,
      key,
      checked: false,
      recipeId: args.recipeId,
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

    const normalizedName = args.name.toLowerCase().trim();
    const normalizedAmount = args.amount?.toLowerCase().trim() || "";
    const key = `${normalizedName}|${normalizedAmount}`;

    const existing = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { action: "removed", id: existing._id };
    } else {
      const itemId = await ctx.db.insert("shoppingItems", {
        userId,
        name: args.name,
        amount: args.amount,
        normalizedName,
        key,
        checked: false,
        recipeId: args.recipeId,
        createdAt: Date.now(),
      });
      return { action: "added", id: itemId };
    }
  },
});

export const toggleShoppingItem = mutation({
  args: { id: v.id("shoppingItems") },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== userId) throw new Error("Item not found or access denied");
    await ctx.db.patch(args.id, { checked: !item.checked });
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
