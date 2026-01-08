import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// List all recipes for current user
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", identity.subject))
      .collect();

    return recipes;
  },
});

// Get single recipe by ID
export const get = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const recipe = await ctx.db.get(args.id);

    if (!recipe || recipe.clerkId !== identity.subject) {
      return null;
    }

    return recipe;
  },
});

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
        checked: v.boolean(),
      })
    ),
    instructions: v.array(
      v.object({
        text: v.string(),
        icon: v.optional(v.string()),
      })
    ),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const now = Date.now();
    const recipeId = await ctx.db.insert("recipes", {
      clerkId: identity.subject,
      title: args.title,
      description: args.description,
      category: args.category,
      prepTimeMinutes: args.prepTimeMinutes,
      difficulty: args.difficulty,
      portions: args.portions,
      ingredients: args.ingredients,
      instructions: args.instructions,
      tags: args.tags,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    });

    return recipeId;
  },
});

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
          checked: v.boolean(),
        })
      )
    ),
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.clerkId !== identity.subject) {
      throw new Error("Recipe not found or access denied");
    }

    const { id, ...updates } = args;
    await ctx.db.patch(args.id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

// Delete recipe
export const remove = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.clerkId !== identity.subject) {
      throw new Error("Recipe not found or access denied");
    }

    await ctx.db.delete(args.id);
  },
});

// Toggle favorite
export const toggleFavorite = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.clerkId !== identity.subject) {
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_favorite", (q) => 
        q.eq("clerkId", identity.subject).eq("isFavorite", true)
      )
      .collect();

    return recipes;
  },
});
