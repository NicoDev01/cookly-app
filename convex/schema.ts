import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // USERS - Clerk Sync + Subscription Data
  users: defineTable({
    // Clerk Authentication
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatar: v.optional(v.string()),
    
    // Subscription Details
    subscription: v.union(
      v.literal("free"),
      v.literal("pro_monthly"),
      v.literal("pro_yearly"),
      v.literal("lifetime")
    ),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("trialing")
    ),
    subscriptionEnd: v.optional(v.number()), // Timestamp wenn gekündigt
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    
    // Onboarding & Preferences
    onboardingCompleted: v.boolean(), // false = zeige onboarding
    cookingFrequency: v.optional(v.string()), // "rare", "regular", "daily"
    preferredCuisines: v.optional(v.array(v.string())), // ["vegan", "pasta"]
    notificationsEnabled: v.boolean(),
    
    // Usage Stats (for Free Tier Limits)
    usageStats: v.object({
      importedRecipes: v.number(),
      importsLastReset: v.number(), // Timestamp (monthly reset)
      weeklyPlansActive: v.number(), // Count of active weeks
    }),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
  .index("by_clerkId", ["clerkId"])
  .index("by_stripeCustomer", ["stripeCustomerId"]),

  // RECIPES - Multi-Tenant (User Isolated)
  recipes: defineTable({
    clerkId: v.string(), // Owner
    
    // Basic Info
    title: v.string(),
    slug: v.optional(v.string()), // SEO-friendly URL
    description: v.optional(v.string()),
    
    // Images
    imageStorageId: v.optional(v.id("_storage")),
    imageBlurhash: v.optional(v.string()),
    sourceImageUrl: v.optional(v.string()), // From KI scan
    sourceUrl: v.optional(v.string()), // Instagram/Website
    
    // Recipe Details
    category: v.string(),
    prepTimeMinutes: v.number(),
    difficulty: v.union(v.literal("Einfach"), v.literal("Mittel"), v.literal("Schwer")),
    portions: v.number(),
    
    // Nested Data
    ingredients: v.array(v.object({
      name: v.string(),
      amount: v.optional(v.string()),
      checked: v.boolean(), // For shopping list integration
    })),
    instructions: v.array(v.object({
      text: v.string(),
      icon: v.optional(v.string()),
    })),
    
    // Organization
    tags: v.optional(v.array(v.string())), // ["vegan", "gluten-free"]
    isFavorite: v.boolean(),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
  .index("by_user", ["clerkId"])
  .index("by_category", ["clerkId", "category"])
  .index("by_favorite", ["clerkId", "isFavorite"])
  .searchIndex("search_title", { searchField: "title" }),

  // WEEKLY PLANS - Multi-Tenant
  weeklyPlans: defineTable({
    clerkId: v.string(),
    weekStart: v.string(), // "YYYY-MM-DD" (Monday)
    recipes: v.array(v.object({
      dayOfWeek: v.string(), // "monday", "tuesday", etc.
      mealType: v.string(), // "lunch", "dinner"
      recipeId: v.id("recipes"),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
  .index("by_user_week", ["clerkId", "weekStart"]),

  // SHOPPING LISTS - Multi-Tenant
  shoppingItems: defineTable({
    clerkId: v.string(),
    name: v.string(),
    amount: v.optional(v.string()),
    normalizedName: v.string(),
    key: v.string(), // normalizedName + "|" + amount
    checked: v.boolean(),
    recipeId: v.optional(v.id("recipes")), // Link to recipe
    createdAt: v.number(),
  })
  .index("by_user", ["clerkId"])
  .index("by_key", ["key"]),

  // CATEGORIES - System-wide (Not User-Specific)
  categories: defineTable({
    name: v.string(),
    icon: v.string(), // emoji or icon name
    color: v.string(), // hex color
    imageStorageId: v.optional(v.id("_storage")),
    order: v.number(), // Sort order
    isActive: v.boolean(),
  })
  .index("by_order", ["order"]),
});
