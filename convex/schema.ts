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
    billingUserId: v.optional(v.string()),

    // Onboarding & Preferences — optional, werden von createOrSyncUser gesetzt
    onboardingCompleted: v.optional(v.boolean()),
    onboardingGoal: v.optional(v.string()),
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
    firstSeenAt: v.optional(v.number()),
    lastActiveAt: v.optional(v.number()),
    firstRecipeAt: v.optional(v.number()),
    lastRecipeAt: v.optional(v.number()),
    lastImportAt: v.optional(v.number()),
    lifecycleStage: v.optional(v.string()),
    acquisitionSource: v.optional(v.string()),
    acquisitionMedium: v.optional(v.string()),
    acquisitionCampaign: v.optional(v.string()),
    acquisitionFirstTouch: v.optional(v.any()),
    acquisitionLastTouch: v.optional(v.any()),
    brevoSyncedAt: v.optional(v.number()),
  })
  .index("by_authUserId", ["authUserId"])
  .index("by_billingUserId", ["billingUserId"])
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
    recipeTitle: v.optional(v.string()),
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

  // Registered storage files. Files are only usable after ownership and purpose validation.
  storageAssets: defineTable({
    storageId: v.id("_storage"),
    userId: v.id("users"),
    purpose: v.union(
      v.literal("recipe_image"),
      v.literal("category_image"),
      v.literal("photo_scan"),
      v.literal("ai_generated"),
      v.literal("imported_image"),
    ),
    state: v.union(v.literal("pending"), v.literal("claimed"), v.literal("released")),
    recipeId: v.optional(v.id("recipes")),
    categoryId: v.optional(v.id("categories")),
    contentType: v.string(),
    sizeBytes: v.number(),
    sha256: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
  })
  .index("by_storageId", ["storageId"])
  .index("by_user_state", ["userId", "state"])
  .index("by_state_expiresAt", ["state", "expiresAt"])
  .index("by_recipe", ["recipeId"]),

  importOperations: defineTable({
    userId: v.id("users"),
    operationId: v.string(),
    provider: v.union(
      v.literal("instagram"),
      v.literal("facebook"),
      v.literal("tiktok"),
      v.literal("website"),
      v.literal("photo_scan"),
    ),
    feature: v.union(v.literal("link_imports"), v.literal("photo_scans")),
    canonicalUrlHash: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceAssetId: v.optional(v.id("_storage")),
    input: v.optional(v.any()),
    status: v.union(
      v.literal("reserved"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("released"),
    ),
    resultRecipeId: v.optional(v.id("recipes")),
    resultDraft: v.optional(v.any()),
    errorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    committedAt: v.optional(v.number()),
  })
  .index("by_user_operation", ["userId", "operationId"])
  .index("by_user_feature_status", ["userId", "feature", "status"])
  .index("by_status_expiresAt", ["status", "expiresAt"])
  .index("by_user_canonicalUrlHash", ["userId", "canonicalUrlHash"]),

  apiRateLimits: defineTable({
    userId: v.id("users"),
    bucket: v.string(),
    windowStart: v.number(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_user_bucket", ["userId", "bucket"]),

  providerDailyUsage: defineTable({
    provider: v.union(
      v.literal("apify"),
      v.literal("jina"),
      v.literal("gemini"),
      v.literal("pollinations"),
    ),
    day: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_provider_day", ["provider", "day"]),

  dailyMetrics: defineTable({
    day: v.string(),
    metric: v.string(),
    dimension: v.optional(v.string()),
    value: v.number(),
    updatedAt: v.number(),
  })
    .index("by_day_metric", ["day", "metric"])
    .index("by_metric_day", ["metric", "day"]),

  analyticsEvents: defineTable({
    eventId: v.string(),
    name: v.string(),
    version: v.number(),
    userId: v.optional(v.id("users")),
    billingUserId: v.optional(v.string()),
    anonymousId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    operationId: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    screen: v.optional(v.string()),
    properties: v.optional(v.any()),
    occurredAt: v.number(),
    receivedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_name_occurredAt", ["name", "occurredAt"])
    .index("by_user_occurredAt", ["userId", "occurredAt"])
    .index("by_receivedAt", ["receivedAt"]),

  integrationJobs: defineTable({
    provider: v.union(
      v.literal("posthog"),
      v.literal("brevo"),
      v.literal("fcm"),
      v.literal("sentry"),
      v.literal("stripe"),
      v.literal("revenuecat"),
    ),
    kind: v.string(),
    dedupeKey: v.string(),
    payload: v.any(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("succeeded"), v.literal("failed")),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    nextAttemptAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_dedupe", ["provider", "dedupeKey"])
    .index("by_status_nextAttemptAt", ["status", "nextAttemptAt"]),

  campaigns: defineTable({
    name: v.string(),
    channel: v.union(v.literal("in_app"), v.literal("push"), v.literal("email")),
    format: v.union(
      v.literal("banner"), v.literal("modal"), v.literal("card"),
      v.literal("paywall"), v.literal("announcement"),
    ),
    status: v.union(
      v.literal("draft"), v.literal("scheduled"), v.literal("active"),
      v.literal("paused"), v.literal("completed"),
    ),
    title: v.string(),
    body: v.string(),
    imageUrl: v.optional(v.string()),
    ctaLabel: v.optional(v.string()),
    ctaDeepLink: v.optional(v.string()),
    audience: v.optional(v.any()),
    placement: v.string(),
    priority: v.number(),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    frequencyCap: v.number(),
    experimentKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_channel", ["status", "channel"])
    .index("by_status_placement", ["status", "placement"]),

  experiments: defineTable({
    key: v.string(),
    posthogFlagId: v.optional(v.number()),
    name: v.string(),
    hypothesis: v.string(),
    status: v.union(
      v.literal("draft"), v.literal("running"), v.literal("paused"), v.literal("completed"),
    ),
    variants: v.array(v.string()),
    audience: v.optional(v.any()),
    rollout: v.number(),
    primaryMetric: v.string(),
    guardrails: v.array(v.string()),
    winner: v.optional(v.string()),
    result: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_status", ["status"]),

  campaignDeliveries: defineTable({
    campaignId: v.id("campaigns"),
    userId: v.id("users"),
    impressionCount: v.number(),
    lastShownAt: v.optional(v.number()),
    clickedAt: v.optional(v.number()),
    dismissedAt: v.optional(v.number()),
    convertedAt: v.optional(v.number()),
  })
    .index("by_campaign_user", ["campaignId", "userId"])
    .index("by_user", ["userId"]),

  pushDevices: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("android"), v.literal("ios"), v.literal("web")),
    deviceId: v.string(),
    locale: v.optional(v.string()),
    timezone: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    enabled: v.boolean(),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user_enabled", ["userId", "enabled"])
    .index("by_user_device", ["userId", "deviceId"]),

  marketingSpend: defineTable({
    day: v.string(),
    channel: v.string(),
    source: v.string(),
    campaign: v.string(),
    adSet: v.optional(v.string()),
    creative: v.optional(v.string()),
    currency: v.string(),
    amount: v.number(),
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    installs: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_day_source", ["day", "source"]),

  revenueEvents: defineTable({
    externalId: v.string(),
    userId: v.optional(v.id("users")),
    type: v.union(
      v.literal("subscription"), v.literal("ad"), v.literal("affiliate"),
      v.literal("sponsored"), v.literal("one_time"),
    ),
    provider: v.string(),
    campaignId: v.optional(v.id("campaigns")),
    productId: v.optional(v.string()),
    currency: v.string(),
    gross: v.number(),
    fees: v.number(),
    taxes: v.optional(v.number()),
    net: v.number(),
    occurredAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_occurredAt", ["occurredAt"])
    .index("by_user_occurredAt", ["userId", "occurredAt"]),

  costEvents: defineTable({
    externalId: v.string(),
    provider: v.string(),
    category: v.string(),
    currency: v.string(),
    amount: v.number(),
    units: v.optional(v.number()),
    occurredAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_occurredAt", ["occurredAt"]),

  adRevenueDaily: defineTable({
    day: v.string(),
    provider: v.string(),
    placement: v.string(),
    format: v.string(),
    country: v.optional(v.string()),
    currency: v.string(),
    impressions: v.number(),
    clicks: v.number(),
    revenue: v.number(),
  }).index("by_day_provider", ["day", "provider"]),

  billingEntitlements: defineTable({
    userId: v.id("users"),
    provider: v.union(
      v.literal("stripe"),
      v.literal("google_play"),
      v.literal("app_store"),
      v.literal("promotional"),
    ),
    externalCustomerId: v.optional(v.string()),
    externalSubscriptionId: v.optional(v.string()),
    productId: v.string(),
    plan: v.union(v.literal("pro_monthly"), v.literal("pro_yearly")),
    status: v.union(
      v.literal("active"),
      v.literal("grace_period"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("expired"),
    ),
    periodEnd: v.optional(v.number()),
    willRenew: v.optional(v.boolean()),
    environment: v.union(v.literal("sandbox"), v.literal("production")),
    updatedAt: v.number(),
  })
    .index("by_user_provider", ["userId", "provider"])
    .index("by_externalSubscription", ["externalSubscriptionId"])
    .index("by_user_status", ["userId", "status"]),

  revenueCatWebhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    billingUserId: v.optional(v.string()),
    processedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_billingUserId", ["billingUserId"])
    .index("by_processedAt", ["processedAt"]),

  accountDeletionRequests: defineTable({
    userId: v.id("users"),
    requestId: v.string(),
    status: v.union(
      v.literal("requested"),
      v.literal("billing_cleanup"),
      v.literal("local_cleanup"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    stripeCustomerId: v.optional(v.string()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user_request", ["userId", "requestId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  // Stripe webhook idempotency guard
  stripeWebhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    processedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_processedAt", ["processedAt"]),
});
