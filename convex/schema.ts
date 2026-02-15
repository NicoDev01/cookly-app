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
    
    // Subscription Details (kein lifetime mehr)
    subscription: v.union(
      v.literal("free"),
      v.literal("pro_monthly"),
      v.literal("pro_yearly")
    ),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due")
    ),
    subscriptionEnd: v.optional(v.number()), // Timestamp wenn gekündigt (DEPRECATED: nutze usageStats.subscriptionEndDate)
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),

    // Onboarding & Preferences
    onboardingCompleted: v.boolean(), // false = zeige onboarding
    cookingFrequency: v.optional(v.string()), // "rare", "regular", "daily"
    preferredCuisines: v.optional(v.array(v.string())), // ["vegan", "pasta"]
    notificationsEnabled: v.boolean(),

    // Usage Stats - Separate Counter für jeden Feature-Typ
    usageStats: v.object({
      // NEW: Separate Counter (Lifetime, kein Reset für Free Tier)
      manualRecipes: v.optional(v.number()),      // Manuell erstellte Rezepte (Limit: 100)
      linkImports: v.optional(v.number()),        // URL/Instagram Imports (Limit: 50)
      photoScans: v.optional(v.number()),         // KI Foto-Scans (Limit: 50)

      // NEW: Subscription Zeiträume (für Pro Tier)
      subscriptionStartDate: v.optional(v.number()),  // Start der Subscription
      subscriptionEndDate: v.optional(v.number()),    // Ende der Subscription

      // NEW: Reset flag für Downgrade
      resetOnDowngrade: v.optional(v.boolean()),

      // OLD: Deprecated fields (for migration compatibility)
      importedRecipes: v.optional(v.number()),     // OLD: Einheitlicher Counter
      importsLastReset: v.optional(v.number()),    // OLD: Wird nicht mehr verwendet
      weeklyPlansActive: v.optional(v.number()),   // OLD: Wird nicht mehr verwendet
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
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    
    // Images
    image: v.optional(v.string()), // Display image URL (Unsplash, AI-generated, etc.)
    imageAlt: v.optional(v.string()), // Alt text for image
    imageStorageId: v.optional(v.id("_storage")), // Convex storage ID for uploaded images
    imageBlurhash: v.optional(v.string()), // Blurhash for loading placeholder
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
  .index("by_user", ["clerkId"])
  .index("by_category", ["clerkId", "category"])
  .index("by_favorite", ["clerkId", "isFavorite"])
  .index("by_sourceUrl", ["sourceUrl"])
  .index("by_user_sourceUrl", ["clerkId", "sourceUrl"])
  .searchIndex("search_title", { searchField: "title" }),

  // WEEKLY MEALS - Multi-Tenant (Individual meals, not grouped in plans)
  weeklyMeals: defineTable({
    clerkId: v.string(),
    recipeId: v.id("recipes"),
    date: v.string(), // YYYY-MM-DD (clean date without suffix)
    scope: v.optional(v.union(v.literal("day"), v.literal("week"))), // "day" = specific day, "week" = for the whole week
    createdAt: v.number(),
    updatedAt: v.number(),
  })
  .index("by_user_date", ["clerkId", "date"])
  .index("by_user_scope", ["clerkId", "scope"]), // New index for scope filtering

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
  .index("by_user_key", ["clerkId", "key"]),

  // CATEGORIES - Multi-Tenant (User Isolated)
  categories: defineTable({
    clerkId: v.string(), // Owner
    name: v.string(),
    icon: v.string(), // emoji or icon name
    color: v.string(), // hex color
    imageStorageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()), // Direkte URL (z.B. Pollinations)
    order: v.number(), // Sort order per user
    isActive: v.boolean(),
  })
  .index("by_user", ["clerkId"])
  .index("by_user_name", ["clerkId", "name"]),

  // CATEGORY STATS - User-Specific counts
  categoryStats: defineTable({
    clerkId: v.string(),
    category: v.string(),
    count: v.number(),
  })
  .index("by_user_category", ["clerkId", "category"]),
});
