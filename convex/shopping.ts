import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get shopping list for current user
export const getShoppingList = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const items = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("clerkId", identity.subject))
      .collect();

    return items;
  },
});

// Add shopping item
export const addShoppingItem = mutation({
  args: {
    name: v.string(),
    amount: v.optional(v.string()),
    recipeId: v.optional(v.id("recipes")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Normalize for deduplication
    const normalizedName = args.name.toLowerCase().trim();
    const normalizedAmount = args.amount?.toLowerCase().trim() || "";
    const key = `${normalizedName}|${normalizedAmount}`;

    // Check if item already exists
    const existing = await ctx.db
      .query("shoppingItems")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (existing) {
      // Item already exists, don't duplicate
      return existing._id;
    }

    const itemId = await ctx.db.insert("shoppingItems", {
      clerkId: identity.subject,
      name: args.name,
      amount: args.amount,
      normalizedName,
      key,
      checked: false,
      recipeId: args.recipeId,
      createdAt: Date.now(),
    });

    return itemId;
  },
});

// Toggle shopping item checked status
export const toggleShoppingItem = mutation({
  args: { id: v.id("shoppingItems") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const item = await ctx.db.get(args.id);
    if (!item || item.clerkId !== identity.subject) {
      throw new Error("Item not found or access denied");
    }

    await ctx.db.patch(args.id, {
      checked: !item.checked,
    });
  },
});

// Remove shopping item
export const removeShoppingItem = mutation({
  args: { id: v.id("shoppingItems") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const item = await ctx.db.get(args.id);
    if (!item || item.clerkId !== identity.subject) {
      throw new Error("Item not found or access denied");
    }

    await ctx.db.delete(args.id);
  },
});

// Clear shopping list
export const clearShoppingList = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const items = await ctx.db
      .query("shoppingItems")
      .withIndex("by_user", (q) => q.eq("clerkId", identity.subject))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }
  },
});
