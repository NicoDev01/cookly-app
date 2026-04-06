import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // USERS - Convex Auth + Subscription Data
  users: defineTable({
    // Convex Auth identity link
    authUserId: v.optional(v.string()),
    clerkId: v.optional(v.string()), // LEGACY
    // Felder die Convex Auth beim OAuth direkt in users schreibt:
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    name: v.optional(v.string()),
    avatar: v.optional(v.string()),
    
    // Subscription Details — optional, werden von createOrSyncUser gesetzt
    subscription: v.optional(v.union(
      v.literal("free"),
      v.literal("pro_monthly"),
      v.literal("pro_yearly")
    )),
    subscriptionStatus: v.optional(v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due")
    )),
    subscriptionEnd: v.optional(v.number()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),

    // Onboarding & Preferences — optional, werden von createOrSyncUser gesetzt
    onboardingCompleted: v.optional(v.boolean()),
    cookingFrequency: v.optional(v.string()),
    preferredCuisines: v.optional(v.array(v.string())),
    notificationsEnabled: v.optional(v.boolean()),

    // Usage Stats
    usageStats: v.optional(v.object({
      manualRecipes: v.optional(v.number()),
      linkImports: v.optional(v.number()),
      photoScans: v.optional(v.number()),
      subscriptionStartDate: v.optional(v.number()),
      subscriptionEndDate: v.optional(v.number()),
      resetOnDowngrade: v.optional(v.boolean()),
      importedRecipes: v.optional(v.number()),
      importsLastReset: v.optional(v.number()),
      weeklyPlansActive: v.optional(v.number()),
    })),

    // Metadata
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
  .index("by_authUserId", ["authUserId"])
  .index("by_stripeCustomer", ["stripeCustomerId"])
  .index("email", ["email"]),

  // RECIPES - Multi-Tenant (User Isolated)
  recipes: defineTable({
    userId: v.optional(v.id("users")), // Owner
    clerkId: v.optional(v.string()), // LEGACY: kept for schema compatibility
    
    // Basic Info
    title: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    
    // Images
    image: v.optional(v.string()), // Display image URL (Unsplash, AI-generated, etc.)
    imageAlt: v.optional(v.string()), // Alt text for image
    imageStorageId: v.optional(v.id("_storage")), // Convex storage ID for uploaded images
    imageBlurhash: v.optional(v.string()), // Blurhash for loading placeholder
    imageWidth: v.optional(v.number()), // Final rendered image width in px
    imageHeight: v.optional(v.number()), // Final rendered image height in px
    imageAspectRatio: v.optional(v.number()), // width / height
    sourceImageUrl: v.optional(v.string()), // Original photo URL from KI scan
    sourceUrl: v.optional(v.string()), // Source URL (Instagram/Website)
    
    // Recipe Details
    category: v.string(),
    prepTimeMinutes: v.number(),
    difficulty: v.union(v.literal("Einfach"), v.literal("Mittel"), v.literal("Schwer")),
    portions: v.number(),
    
    // Nested Data
    ingredients: v.array(v.object({
      name: v.string(),
      amount: v.optional(v.string()),
      checked: v.boolean(),
    })),
    instructions: v.array(v.object({
      text: v.string(),
      icon: v.optional(v.string()),
    })),
    
    // Organization
    tags: v.optional(v.array(v.string())),
    isFavorite: v.boolean(),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
  .index("by_user", ["userId"])
  .index("by_category", ["userId", "category"])
  .index("by_favorite", ["userId", "isFavorite"])
  .index("by_sourceUrl", ["sourceUrl"])
  .index("by_user_sourceUrl", ["userId", "sourceUrl"])
  .searchIndex("search_title", { searchField: "title" }),

  // WEEKLY MEALS - Multi-Tenant (Individual meals, not grouped in plans)
  weeklyMeals: defineTable({
    userId: v.optional(v.id("users")),
    clerkId: v.optional(v.string()), // LEGACY
    recipeId: v.id("recipes"),
    date: v.string(), // YYYY-MM-DD (clean date without suffix)
    scope: v.optional(v.union(v.literal("day"), v.literal("week"))), // "day" = specific day, "week" = for the whole week
    createdAt: v.number(),
    updatedAt: v.number(),
  })
  .index("by_user_date", ["userId", "date"])
  .index("by_user_scope", ["userId", "scope"]),

  // SHOPPING LISTS - Multi-Tenant
  shoppingItems: defineTable({
    userId: v.optional(v.id("users")),
    clerkId: v.optional(v.string()), // LEGACY
    name: v.string(),
    amount: v.optional(v.string()),
    normalizedName: v.string(),
    key: v.string(), // normalizedName + "|" + amount
    checked: v.boolean(),
    recipeId: v.optional(v.id("recipes")), // Link to recipe
    createdAt: v.number(),
  })
  .index("by_user", ["userId"])
  .index("by_user_key", ["userId", "key"]),

  // CATEGORIES - Multi-Tenant (User Isolated)
  categories: defineTable({
    userId: v.optional(v.id("users")), // Owner
    clerkId: v.optional(v.string()), // LEGACY
    name: v.string(),
    icon: v.string(), // emoji or icon name
    color: v.string(), // hex color
    imageStorageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()), // Direkte URL (z.B. Pollinations)
    order: v.number(), // Sort order per user
    isActive: v.boolean(),
  })
  .index("by_user", ["userId"])
  .index("by_user_name", ["userId", "name"]),

  // CATEGORY STATS - User-Specific counts
  categoryStats: defineTable({
    userId: v.optional(v.id("users")),
    clerkId: v.optional(v.string()), // LEGACY
    category: v.string(),
    count: v.number(),
  })
  .index("by_user_category", ["userId", "category"]),

  // Stripe webhook idempotency guard
  stripeWebhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    processedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_processedAt", ["processedAt"]),
});
