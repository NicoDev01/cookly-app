import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { FREE_LIMITS } from "./constants";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { hasProAccess, setProviderStatus, upsertEntitlement } from "./billing";
import { internal } from "./_generated/api";
import { enqueueIntegration } from "./integrations";

// ============================================================
// HELPER
// ============================================================

/**
 * Gibt den aktuell eingeloggten User aus der custom users-Tabelle zurück.
 * Nutzt Convex Auth statt  identity.
 */
async function getCurrentUserFromCtx(ctx: QueryCtx | MutationCtx) {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;

  const linkedUser = await ctx.db
    .query("users")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
    .first();
  if (linkedUser) return linkedUser;

  return await ctx.db.get(authUserId as Id<"users">);
}

async function getUserByAuthUserId(ctx: QueryCtx | MutationCtx, authUserId: string) {
  const linkedUser = await ctx.db
    .query("users")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId))
    .first();
  if (linkedUser) return linkedUser;

  return await ctx.db.get(authUserId as Id<"users">);
}

async function activeImports(ctx: QueryCtx, userId: Id<"users">, feature: "link_imports" | "photo_scans") {
  const rows = await Promise.all(["reserved", "running"].map((status) =>
    ctx.db.query("importOperations")
      .withIndex("by_user_feature_status", (q) => q.eq("userId", userId).eq("feature", feature).eq("status", status as "reserved" | "running"))
      .collect()
  ));
  return rows[0].length + rows[1].length;
}

const stripeEnvironment = () => process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "production" as const : "sandbox" as const;

// ============================================================
// PUBLIC QUERIES
// ============================================================

/**
 * Get current authenticated user
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return null;

    const linkedUser = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
      .first();
    if (linkedUser) return linkedUser;

    // Trigger createOrSyncUser in the client bootstrap flow.
    return null;
  },
});

/**
 * Prüft ob User ein manuelles Rezept erstellen kann
 */
export const canCreateManualRecipe = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) return { canProceed: false, error: "NOT_AUTHENTICATED" };
    return {
      canProceed: true,
      isPro: await hasProAccess(ctx, user._id),
      subscription: user.subscription ?? "free",
      current: user.usageStats?.manualRecipes ?? 0,
      limit: null,
      remaining: null,
      feature: "manual_recipes" as const,
    };
  },
});

/**
 * Prüft ob User einen Link Import machen kann
 */
export const canImportFromLink = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) return { canProceed: false, error: "NOT_AUTHENTICATED" };
    const subscription = await hasProAccess(ctx, user._id) ? (user.subscription === "pro_yearly" ? "pro_yearly" : "pro_monthly") : "free";

    if (subscription !== "free") {
      return { canProceed: true, isPro: true, subscription };
    }

    const current = (user.usageStats?.linkImports || 0) + await activeImports(ctx, user._id, "link_imports");
    const limit = FREE_LIMITS.LINK_IMPORTS;
    return {
      canProceed: current < limit,
      isPro: false,
      subscription: "free" as const,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      feature: "link_imports" as const,
    };
  },
});

/**
 * Prüft ob User ein Foto scannen kann
 */
export const canScanPhoto = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) return { canProceed: false, error: "NOT_AUTHENTICATED" };
    const subscription = await hasProAccess(ctx, user._id) ? (user.subscription === "pro_yearly" ? "pro_yearly" : "pro_monthly") : "free";

    if (subscription !== "free") {
      return { canProceed: true, isPro: true, subscription };
    }

    const current = (user.usageStats?.photoScans || 0) + await activeImports(ctx, user._id, "photo_scans");
    const limit = FREE_LIMITS.PHOTO_SCANS;
    return {
      canProceed: current < limit,
      isPro: false,
      subscription: "free" as const,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      feature: "photo_scans" as const,
    };
  },
});

/**
 * Get usage stats (für ProfilePage)
 */
export const getUsageStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) return null;

    const isPro = await hasProAccess(ctx, user._id);
    return {
      usage: user.usageStats,
      isPro,
      limits: {
        recipes: null,
        imports: FREE_LIMITS.LINK_IMPORTS,
        scans: FREE_LIMITS.PHOTO_SCANS,
      },
    };
  },
});

// ============================================================
// PUBLIC MUTATIONS
// ============================================================

/**
 * Erstellt den User-Datensatz nach erfolgreichem Login/Signup.
 * Wird aus ProtectedLayout aufgerufen wenn currentUser null ist.
 * Ersetzt syncUserIfNotExists + createOrUpdateUserFromWebhook.
 */
export const createOrSyncUser = mutation({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");

    // Existiert bereits → nichts tun
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
      .first();

    if (existing) {
      if (!existing.billingUserId) {
        await ctx.db.patch(existing._id, { billingUserId: crypto.randomUUID(), updatedAt: Date.now() });
      }
      await ctx.db.patch(existing._id, { lastActiveAt: Date.now(), updatedAt: Date.now() });
      return existing._id;
    }

    const authUserDoc = await ctx.db.get(authUserId as Id<"users">);
    if (authUserDoc) {
      const now = Date.now();
      const billingUserId = authUserDoc.billingUserId ?? crypto.randomUUID();
      const identity = await ctx.auth.getUserIdentity();
      const email = identity?.email ?? undefined;
      const name = identity?.name ?? email?.split("@")[0] ?? "User";
      const avatar = identity?.pictureUrl ?? undefined;

      await ctx.db.patch(authUserDoc._id, {
        authUserId: authUserId.toString(),
        billingUserId,
        email: authUserDoc.email ?? email,
        name: authUserDoc.name ?? name,
        avatar: authUserDoc.avatar ?? avatar,
        subscription: authUserDoc.subscription ?? "free",
        subscriptionStatus: authUserDoc.subscriptionStatus ?? "active",
        onboardingCompleted: authUserDoc.onboardingCompleted ?? false,
        notificationsEnabled: authUserDoc.notificationsEnabled ?? false,
        usageStats: authUserDoc.usageStats ?? {
          manualRecipes: 0,
          linkImports: 0,
          photoScans: 0,
          subscriptionStartDate: undefined,
          subscriptionEndDate: undefined,
          resetOnDowngrade: false,
        },
        createdAt: authUserDoc.createdAt ?? now,
        firstSeenAt: authUserDoc.firstSeenAt ?? now,
        lastActiveAt: now,
        lifecycleStage: authUserDoc.lifecycleStage ?? "registered",
        updatedAt: now,
      });

      if (email) {
        await enqueueIntegration(ctx, "brevo", "contact", `contact:${authUserDoc._id}:sync:${now}`, {
          email,
          updateEnabled: true,
          attributes: {
            COOKLY_USER_ID: billingUserId,
            FIRSTNAME: name,
            CREATED_AT: new Date(authUserDoc.createdAt ?? now).toISOString(),
            PLAN: authUserDoc.subscription ?? "free",
            LIFECYCLE_STAGE: authUserDoc.lifecycleStage ?? "registered",
          },
        });
        await ctx.scheduler.runAfter(0, internal.integrations.processJobs);
      }

      return authUserDoc._id;
    }

    // Profildaten aus Convex Auth Identity
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email ?? undefined;
    const name = identity?.name ?? email?.split("@")[0] ?? "User";
    const avatar = identity?.pictureUrl ?? undefined;

    const now = Date.now();
    const billingUserId = crypto.randomUUID();
    const userId = await ctx.db.insert("users", {
      authUserId: authUserId.toString(),
      billingUserId,
      email,
      name,
      avatar,
      subscription: "free",
      subscriptionStatus: "active",
      onboardingCompleted: false,
      notificationsEnabled: false,
      usageStats: {
        manualRecipes: 0,
        linkImports: 0,
        photoScans: 0,
        subscriptionStartDate: undefined,
        subscriptionEndDate: undefined,
        resetOnDowngrade: false,
      },
      createdAt: now,
      firstSeenAt: now,
      lastActiveAt: now,
      lifecycleStage: "registered",
      updatedAt: now,
    });

    if (email) {
      await enqueueIntegration(ctx, "brevo", "contact", `contact:${userId}:created`, {
        email,
        updateEnabled: true,
        attributes: {
          COOKLY_USER_ID: billingUserId,
          FIRSTNAME: name,
          CREATED_AT: new Date(now).toISOString(),
          PLAN: "free",
          LIFECYCLE_STAGE: "registered",
        },
      });
      await ctx.scheduler.runAfter(0, internal.integrations.processJobs);
    }

    console.log(`[UserSync] ✅ Created user ${authUserId} in Convex`);
    return userId;
  },
});

export const ensureBillingUserId = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) throw new Error("NOT_AUTHENTICATED");
    if (user.billingUserId) return user.billingUserId;
    const billingUserId = crypto.randomUUID();
    await ctx.db.patch(user._id, { billingUserId, updatedAt: Date.now() });
    return billingUserId;
  },
});

/**
 * Update onboarding data
 */
export const updateOnboarding = mutation({
  args: {
    name: v.optional(v.string()),
    onboardingGoal: v.optional(v.string()),
    cookingFrequency: v.optional(v.string()),
    preferredCuisines: v.optional(v.array(v.string())),
    notificationsEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) throw new Error("Not authenticated");

    await ctx.db.patch(user._id, {
      name: args.name ?? user.name,
      onboardingGoal: args.onboardingGoal ?? user.onboardingGoal,
      cookingFrequency: args.cookingFrequency ?? user.cookingFrequency,
      preferredCuisines: args.preferredCuisines ?? user.preferredCuisines,
      notificationsEnabled: args.notificationsEnabled ?? user.notificationsEnabled,
      updatedAt: Date.now(),
    });
    if (user.email) {
      await enqueueIntegration(ctx, "brevo", "contact", `contact:${user._id}:onboarding:${Date.now()}`, {
        email: user.email,
        updateEnabled: true,
        attributes: {
          COOKLY_USER_ID: user.billingUserId ?? String(user._id),
          FIRSTNAME: args.name ?? user.name,
          ONBOARDING_GOAL: args.onboardingGoal ?? user.onboardingGoal,
          PLAN: user.subscription ?? "free",
          LIFECYCLE_STAGE: "onboarding",
        },
      });
      await ctx.scheduler.runAfter(0, internal.integrations.processJobs);
    }
  },
});

export const updateNotificationPreference = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) throw new Error("NOT_AUTHENTICATED");
    await ctx.db.patch(user._id, { notificationsEnabled: enabled, updatedAt: Date.now() });
  },
});

/**
 * Compatibility endpoint for installed clients released before accountDeletion.requestDeletion.
 * The deletion continues server-side after the legacy client signs out.
 */
export const deleteCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("NOT_AUTHENTICATED");
    await ctx.scheduler.runAfter(0, internal.accountDeletion.requestDeletionForAuth, {
      authUserId: authUserId.toString(),
      requestId: crypto.randomUUID(),
    });
    return { status: "scheduled" as const };
  },
});

/**
 * Complete onboarding
 */
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) throw new Error("Not authenticated");

    await ctx.db.patch(user._id, {
      onboardingCompleted: true,
      lifecycleStage: "activated",
      updatedAt: Date.now(),
    });
  },
});

export const touchActivity = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) return;
    const now = Date.now();
    if ((user.lastActiveAt ?? 0) > now - 15 * 60_000) return;
    const reactivated = user.lifecycleStage === "dormant";
    await ctx.db.patch(user._id, {
      lastActiveAt: now,
      lifecycleStage: reactivated ? "engaged" : user.lifecycleStage,
      updatedAt: now,
    });
    if (reactivated && user.email) {
      await enqueueIntegration(ctx, "brevo", "event", `reactivated:${user._id}:${now}`, {
        event_name: "cookly_user_reactivated",
        identifiers: { email_id: user.email },
        contact_properties: { COOKLY_USER_ID: user.billingUserId ?? String(user._id) },
      });
      await ctx.scheduler.runAfter(0, internal.integrations.processJobs);
    }
  },
});

const attributionTouch = v.object({
  source: v.optional(v.string()),
  medium: v.optional(v.string()),
  campaign: v.optional(v.string()),
  adSet: v.optional(v.string()),
  creative: v.optional(v.string()),
  keyword: v.optional(v.string()),
  clickId: v.optional(v.string()),
  referrer: v.optional(v.string()),
  landingPage: v.optional(v.string()),
  capturedAt: v.number(),
});

const attributionFields = [
  "source",
  "medium",
  "campaign",
  "adSet",
  "creative",
  "keyword",
  "clickId",
  "referrer",
  "landingPage",
  "capturedAt",
] as const;

const sameAttributionTouch = (current: unknown, next: unknown) => {
  if (!current || typeof current !== "object" || !next || typeof next !== "object") {
    return false;
  }
  const left = current as Record<string, unknown>;
  const right = next as Record<string, unknown>;
  return attributionFields.every((field) => left[field] === right[field]);
};

export const recordAttribution = mutation({
  args: { touch: attributionTouch },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user) return;

    const acquisitionSource = user.acquisitionSource ?? args.touch.source;
    const acquisitionMedium = user.acquisitionMedium ?? args.touch.medium;
    const acquisitionCampaign = user.acquisitionCampaign ?? args.touch.campaign;
    const acquisitionFirstTouch = user.acquisitionFirstTouch ?? args.touch;

    if (
      user.acquisitionSource === acquisitionSource &&
      user.acquisitionMedium === acquisitionMedium &&
      user.acquisitionCampaign === acquisitionCampaign &&
      sameAttributionTouch(user.acquisitionFirstTouch, acquisitionFirstTouch) &&
      sameAttributionTouch(user.acquisitionLastTouch, args.touch)
    ) {
      return;
    }

    await ctx.db.patch(user._id, {
      acquisitionSource,
      acquisitionMedium,
      acquisitionCampaign,
      acquisitionFirstTouch,
      acquisitionLastTouch: args.touch,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update subscription (called from authenticated user context)
 */
export const updateSubscription = mutation({
  args: {
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
    subscriptionEndDate: v.optional(v.number()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async () => {
    throw new Error("Subscription updates are managed by Stripe webhooks only.");
  },
});

// ============================================================
// INTERNAL MUTATIONS
// ============================================================

/**
 * Erhöht den entsprechenden Usage Counter nach erfolgreichem Insert.
 * Wird von recipes.ts etc. aufgerufen.
 */
export const incrementUsageCounter = internalMutation({
  args: {
    userId: v.id("users"),
    feature: v.union(
      v.literal("manual_recipes"),
      v.literal("link_imports"),
      v.literal("photo_scans")
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Pro User brauchen keine Counter
    if (await hasProAccess(ctx, user._id)) return;

    const currentStats = user.usageStats || {
      manualRecipes: 0,
      linkImports: 0,
      photoScans: 0,
      subscriptionStartDate: undefined,
      subscriptionEndDate: undefined,
      resetOnDowngrade: false,
    };

    const updates: Record<string, unknown> = {};
    switch (args.feature) {
      case "manual_recipes":
        return;
      case "link_imports":
        updates.usageStats = { ...currentStats, linkImports: (currentStats.linkImports || 0) + 1 };
        break;
      case "photo_scans":
        updates.usageStats = { ...currentStats, photoScans: (currentStats.photoScans || 0) + 1 };
        break;
    }

    await ctx.db.patch(user._id, { ...updates, updatedAt: Date.now() });
  },
});

export const getPhotoScanLimitStatusByAuthUserId = internalQuery({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByAuthUserId(ctx, args.authUserId);
    if (!user) throw new Error("NOT_AUTHENTICATED");

    const subscription = await hasProAccess(ctx, user._id) ? (user.subscription === "pro_yearly" ? "pro_yearly" : "pro_monthly") : "free";
    const current = user.usageStats?.photoScans || 0;
    const limit = FREE_LIMITS.PHOTO_SCANS;

    if (subscription !== "free") {
      return {
        canProceed: true,
        isPro: true,
        subscription,
        current,
        limit,
        remaining: Number.MAX_SAFE_INTEGER,
        feature: "photo_scans" as const,
      };
    }

    return {
      canProceed: current < limit,
      isPro: false,
      subscription: "free" as const,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      feature: "photo_scans" as const,
    };
  },
});

/**
 * Lebenslange Free-Counter bleiben beim Downgrade erhalten.
 */
export const resetUsageCounters = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;
    if (await hasProAccess(ctx, user._id)) return;

    await ctx.db.patch(user._id, {
      usageStats: {
        ...user.usageStats,
        subscriptionEndDate: undefined,
        resetOnDowngrade: false,
      },
      updatedAt: Date.now(),
    });
    console.log(`[Reset] Downgrade marker cleared for user ${args.userId}`);
  },
});

/**
 * Markiert User für Downgrade (bei Kündigung)
 */
export const markForDowngrade = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      usageStats: { ...user.usageStats, resetOnDowngrade: true },
      updatedAt: Date.now(),
    });
    console.log(`[Downgrade] User ${args.userId} marked for counter reset`);
  },
});

/**
 * Markiert User für Downgrade via Stripe Customer ID
 */
export const markForDowngradeByStripeCustomer = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    subscriptionEndDate: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();

    if (!user) {
      console.error(`User with stripeCustomerId ${args.stripeCustomerId} not found`);
      return;
    }

    await ctx.db.patch(user._id, {
      usageStats: {
        ...user.usageStats,
        subscriptionEndDate: args.subscriptionEndDate,
        resetOnDowngrade: true,
      },
      updatedAt: Date.now(),
    });
    for (const entitlement of await ctx.db.query("billingEntitlements").withIndex("by_user_provider", (q) => q.eq("userId", user._id).eq("provider", "stripe")).collect()) {
      await ctx.db.patch(entitlement._id, { willRenew: false, updatedAt: Date.now() });
    }
    console.log(`[Downgrade] Customer ${args.stripeCustomerId} marked for reset at ${new Date(args.subscriptionEndDate).toISOString()}`);
  },
});

/**
 * Entfernt den Downgrade-Marker (z. B. wenn Kündigung rückgängig gemacht wurde)
 */
export const clearDowngradeMarkByStripeCustomer = internalMutation({
  args: {
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();

    if (!user) {
      console.error(`User with stripeCustomerId ${args.stripeCustomerId} not found`);
      return;
    }

    await ctx.db.patch(user._id, {
      usageStats: {
        ...user.usageStats,
        resetOnDowngrade: false,
      },
      updatedAt: Date.now(),
    });
    for (const entitlement of await ctx.db.query("billingEntitlements").withIndex("by_user_provider", (q) => q.eq("userId", user._id).eq("provider", "stripe")).collect()) {
      await ctx.db.patch(entitlement._id, { willRenew: true, updatedAt: Date.now() });
    }
  },
});

/**
 * Setzt Subscription-Felder auf Free zurück (harte Downgrade-Aktion)
 */
export const downgradeToFreeByStripeCustomer = internalMutation({
  args: {
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();

    if (!user) {
      console.error(`User with stripeCustomerId ${args.stripeCustomerId} not found`);
      return;
    }

    await ctx.db.patch(user._id, {
      subscription: "free",
      subscriptionStatus: "canceled",
      usageStats: {
        ...user.usageStats,
        subscriptionStartDate: undefined,
        subscriptionEndDate: undefined,
      },
      stripeSubscriptionId: undefined,
      updatedAt: Date.now(),
    });
    await setProviderStatus(ctx, user._id, "stripe", "expired");
  },
});

/**
 * Update Subscription via Convex User ID (für Stripe Webhooks)
 * Ersetzt 
 */
export const updateSubscriptionByConvexUserId = internalMutation({
  args: {
    convexUserId: v.string(),
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
    subscriptionStartDate: v.optional(v.number()),
    subscriptionEndDate: v.optional(v.number()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.convexUserId as Id<"users">);
    if (!user) throw new Error(`User ${args.convexUserId} not found`);

    const nextUsageStats = {
      ...user.usageStats,
      ...(args.subscriptionStartDate !== undefined
        ? { subscriptionStartDate: args.subscriptionStartDate }
        : {}),
      ...(args.subscriptionEndDate !== undefined
        ? { subscriptionEndDate: args.subscriptionEndDate }
        : {}),
    };

    await ctx.db.patch(user._id, {
      subscription: args.subscription,
      subscriptionStatus: args.subscriptionStatus,
      usageStats: nextUsageStats,
      stripeCustomerId: args.stripeCustomerId ?? user.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId ?? user.stripeSubscriptionId,
      updatedAt: Date.now(),
    });
    if (args.subscription !== "free") {
      await upsertEntitlement(ctx, {
        userId: user._id,
        provider: "stripe",
        externalCustomerId: args.stripeCustomerId ?? user.stripeCustomerId,
        externalSubscriptionId: args.stripeSubscriptionId ?? user.stripeSubscriptionId,
        productId: args.subscription,
        plan: args.subscription,
        status: args.subscriptionStatus,
        periodEnd: args.subscriptionEndDate,
        willRenew: args.subscriptionStatus === "active",
        environment: stripeEnvironment(),
      });
    }
  },
});

/**
 * Update Subscription via Stripe Customer ID (für Stripe Webhooks)
 */
export const updateSubscriptionByStripeCustomer = internalMutation({
  args: {
    stripeCustomerId: v.string(),
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
    subscriptionEndDate: v.optional(v.number()),
    subscriptionStartDate: v.optional(v.number()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();

    if (!user) {
      console.error(`User with stripeCustomerId ${args.stripeCustomerId} not found`);
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.subscription !== undefined) updates.subscription = args.subscription;
    if (args.subscriptionStatus !== undefined) updates.subscriptionStatus = args.subscriptionStatus;
    if (args.subscriptionEndDate !== undefined || args.subscriptionStartDate !== undefined) {
      const nextUsageStats = { ...user.usageStats };
      if (args.subscriptionEndDate !== undefined) {
        nextUsageStats.subscriptionEndDate = args.subscriptionEndDate;
      }
      if (args.subscriptionStartDate !== undefined) {
        nextUsageStats.subscriptionStartDate = args.subscriptionStartDate;
      }
      updates.usageStats = {
        ...nextUsageStats,
      };
    }
    if (args.stripeSubscriptionId !== undefined) {
      updates.stripeSubscriptionId = args.stripeSubscriptionId;
    }

    await ctx.db.patch(user._id, updates);
    const plan = args.subscription === "pro_yearly" || (args.subscription === undefined && user.subscription === "pro_yearly")
      ? "pro_yearly" as const
      : "pro_monthly" as const;
    await upsertEntitlement(ctx, {
      userId: user._id,
      provider: "stripe",
      externalCustomerId: args.stripeCustomerId,
      externalSubscriptionId: args.stripeSubscriptionId ?? user.stripeSubscriptionId,
      productId: plan,
      plan,
      status: args.subscriptionStatus ?? (user.subscriptionStatus === "canceled" ? "canceled" : user.subscriptionStatus === "past_due" ? "past_due" : "active"),
      periodEnd: args.subscriptionEndDate ?? user.subscriptionEnd ?? user.usageStats?.subscriptionEndDate,
      willRenew: !(user.usageStats?.resetOnDowngrade ?? false),
      environment: stripeEnvironment(),
    });
  },
});

/**
 * Update nur den Subscription Status (für payment_failed etc.)
 */
export const updateSubscriptionStatusByStripeCustomer = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due")
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();

    if (!user) {
      console.error(`User with stripeCustomerId ${args.stripeCustomerId} not found`);
      return;
    }

    await ctx.db.patch(user._id, {
      subscriptionStatus: args.subscriptionStatus,
      updatedAt: Date.now(),
    });
    const plan = user.subscription === "pro_yearly" ? "pro_yearly" : "pro_monthly";
    await upsertEntitlement(ctx, {
      userId: user._id,
      provider: "stripe",
      externalCustomerId: args.stripeCustomerId,
      externalSubscriptionId: user.stripeSubscriptionId,
      productId: plan,
      plan,
      status: args.subscriptionStatus,
      periodEnd: user.subscriptionEnd ?? user.usageStats?.subscriptionEndDate,
      willRenew: args.subscriptionStatus === "active",
      environment: stripeEnvironment(),
    });
  },
});
