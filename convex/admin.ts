import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { ALLOWED_EVENT_PROPERTIES, EVENT_NAMES } from "../analytics/eventRegistry";

const meaningfulEvents = new Set([
  "recipe_saved",
  "recipe_reopened",
  "weekly_meal_added",
  "shopping_item_checked",
]);

export const snapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const weekAgo = now - 7 * 86_400_000;
    const monthAgo = now - 30 * 86_400_000;
    const ninetyDaysAgo = now - 90 * 86_400_000;
    const [users, events, revenue, costs, spend, campaigns, experiments, jobs, providerUsage] = await Promise.all([
      ctx.db.query("users").take(10_000),
      ctx.db.query("analyticsEvents").withIndex("by_receivedAt", (q) => q.gte("receivedAt", ninetyDaysAgo)).take(10_000),
      ctx.db.query("revenueEvents").withIndex("by_occurredAt", (q) => q.gte("occurredAt", monthAgo)).take(10_000),
      ctx.db.query("costEvents").withIndex("by_occurredAt", (q) => q.gte("occurredAt", monthAgo)).take(10_000),
      ctx.db.query("marketingSpend").take(10_000),
      ctx.db.query("campaigns").take(500),
      ctx.db.query("experiments").take(500),
      ctx.db.query("integrationJobs").take(1_000),
      ctx.db.query("providerDailyUsage").take(1_000),
    ]);

    const weeklyEngaged = new Set(
      events
        .filter((event) => event.occurredAt >= weekAgo && meaningfulEvents.has(event.name))
        .map((event) => event.billingUserId ?? event.userId)
        .filter(Boolean),
    ).size;
    const newUsers = users.filter((user) => (user.createdAt ?? 0) >= weekAgo).length;
    const activated = users.filter((user) => user.firstRecipeAt).length;
    const newlyActivated = users.filter((user) =>
      (user.createdAt ?? 0) >= monthAgo && user.firstRecipeAt
    ).length;
    const gross = revenue.reduce((sum, item) => sum + item.gross, 0);
    const net = revenue.reduce((sum, item) => sum + item.net, 0);
    const subscriptionNet = revenue
      .filter((item) => item.type === "subscription")
      .reduce((sum, item) => sum + item.net, 0);
    const operatingCosts = costs.reduce((sum, item) => sum + item.amount, 0);
    const marketingCosts = spend
      .filter((item) => item.day >= new Date(monthAgo).toISOString().slice(0, 10))
      .reduce((sum, item) => sum + item.amount, 0);
    const criticalJobs = jobs.filter((job) => job.status === "failed").length;
    const payingUsers = new Set(revenue.map((item) => item.userId).filter(Boolean)).size;
    const proUsers = users.filter((user) =>
      user.subscription === "pro_monthly" || user.subscription === "pro_yearly"
    );
    const churnedUsers = proUsers.filter((user) => user.subscriptionStatus === "canceled").length;
    const churn = proUsers.length ? churnedUsers / proUsers.length : 0;
    const arpu = users.length ? net / users.length : 0;
    const arppu = payingUsers ? net / payingUsers : 0;
    const ltv = churn ? arppu / churn : arppu;
    const contributionPerPayer = payingUsers
      ? (net - operatingCosts - marketingCosts) / payingUsers
      : 0;
    const importSuccesses = events.filter((event) =>
      event.name === "import_succeeded" && event.occurredAt >= monthAgo
    ).length;
    const retention = (day: number) => {
      const cohort = users.filter((user) => {
        const createdAt = user.createdAt ?? user._creationTime;
        return createdAt >= ninetyDaysAgo && createdAt <= now - day * 86_400_000;
      });
      const retained = cohort.filter((user) => {
        const start = (user.createdAt ?? user._creationTime) + day * 86_400_000;
        const end = start + 86_400_000;
        return events.some((event) =>
          event.userId === user._id
          && event.occurredAt >= start
          && event.occurredAt < end
          && meaningfulEvents.has(event.name)
        );
      }).length;
      return cohort.length ? retained / cohort.length : 0;
    };
    const activationTimes = users
      .filter((user) => user.firstRecipeAt && user.createdAt)
      .map((user) => (user.firstRecipeAt ?? 0) - (user.createdAt ?? 0))
      .filter((duration) => duration >= 0)
      .sort((a, b) => a - b);
    const timeToFirstValueMs = activationTimes.length
      ? activationTimes[Math.floor(activationTimes.length / 2)]
      : 0;
    const revenueByCampaign = Object.entries(revenue.reduce<Record<string, number>>((result, item) => {
      if (item.campaignId) result[String(item.campaignId)] = (result[String(item.campaignId)] ?? 0) + item.net;
      return result;
    }, {})).map(([campaignId, amount]) => ({ campaignId, amount }));
    const missingContext = events.filter((event) => !event.platform || !event.version).length;
    const delayed = events.filter((event) => event.receivedAt - event.occurredAt > 60_000).length;
    const allowedProperties = new Set<string>(ALLOWED_EVENT_PROPERTIES);
    const knownEvents = new Set<string>(EVENT_NAMES);
    const unknownProperties = events.filter((event) =>
      event.properties && typeof event.properties === "object"
      && Object.keys(event.properties).some((key) => !allowedProperties.has(key))
    ).length;
    const unknownEvents = events.filter((event) =>
      !knownEvents.has(event.name) && !/^(email_|synthetic_)/.test(event.name)
    ).length;
    const integrations = Object.fromEntries(
      ["posthog", "brevo", "fcm", "sentry", "stripe", "revenuecat"].map((provider) => {
        const relevant = jobs.filter((job) => job.provider === provider);
        return [provider, {
          failed: relevant.filter((job) => job.status === "failed").length,
          pending: relevant.filter((job) => job.status === "pending").length,
          lastSuccessAt: Math.max(0, ...relevant.filter((job) => job.status === "succeeded").map((job) => job.updatedAt)),
        }];
      }),
    );
    const loadDurations = events
      .filter((event) => event.name === "screen_load_completed" || event.name === "screen_load_slow")
      .map((event) => Number((event.properties as Record<string, unknown> | undefined)?.durationMs))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const p95ScreenLoadMs = loadDurations.length
      ? loadDurations[Math.floor((loadDurations.length - 1) * 0.95)]
      : 0;
    const failedImports = events.filter((event) => event.name === "import_failed");
    const topDimension = (key: "platform" | "appVersion") => {
      const counts = new Map<string, number>();
      for (const event of failedImports) {
        const value = event[key] ?? "unknown";
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "–";
    };
    const revenueByType = Object.entries(revenue.reduce<Record<string, number>>((result, item) => {
      result[item.type] = (result[item.type] ?? 0) + item.net;
      return result;
    }, {})).map(([type, amount]) => ({ type, amount }));
    const revenueByProvider = Object.entries(revenue.reduce<Record<string, number>>((result, item) => {
      result[item.provider] = (result[item.provider] ?? 0) + item.net;
      return result;
    }, {})).map(([provider, amount]) => ({ provider, amount }));

    return {
      generatedAt: now,
      executive: {
        weeklyEngagedCooks: weeklyEngaged,
        totalUsers: users.length,
        newUsers,
        activationRate: users.length ? activated / users.length : 0,
        timeToFirstValueMs,
        d7Retention: retention(7),
        d30Retention: retention(30),
        proUsers: proUsers.length,
        mrr: subscriptionNet,
        arr: subscriptionNet * 12,
        churn,
        arpu,
        arppu,
        ltv,
        grossRevenue30d: gross,
        netRevenue30d: net,
        contributionMargin30d: net - operatingCosts - marketingCosts,
        costPerSuccessfulImport: importSuccesses ? operatingCosts / importSuccesses : 0,
        failedIntegrationJobs: criticalJobs,
      },
      funnels: {
        signup: eventCounts(events, ["signup_started", "signup_submitted", "signup_completed"]),
        onboarding: eventCounts(events, ["onboarding_started", "onboarding_completed"]),
        import: eventCounts(events, ["import_started", "import_ai_completed", "import_recipe_saved", "import_succeeded", "import_failed"]),
        paywall: eventCounts(events, ["paywall_viewed", "checkout_started", "purchase_completed"]),
      },
      marketing: {
        spend30d: marketingCosts,
        cac: newlyActivated ? marketingCosts / newlyActivated : 0,
        roas: marketingCosts ? gross / marketingCosts : 0,
        ltvToCac: marketingCosts && newlyActivated ? ltv / (marketingCosts / newlyActivated) : 0,
        paybackMonths: contributionPerPayer > 0 && newlyActivated
          ? (marketingCosts / newlyActivated) / contributionPerPayer
          : 0,
        campaigns: campaigns.map((campaign) => ({
          id: campaign._id,
          name: campaign.name,
          channel: campaign.channel,
          status: campaign.status,
          placement: campaign.placement,
          priority: campaign.priority,
        })),
        revenueByCampaign,
      },
      economics: {
        revenueByType,
        revenueByProvider,
        operatingCosts30d: operatingCosts,
        marketingCosts30d: marketingCosts,
      },
      experiments,
      reliability: {
        failedJobs: jobs.filter((job) => job.status === "failed").slice(0, 50),
        slowScreens: eventCounts(events, ["screen_load_slow"]),
        p95ScreenLoadMs,
        importFailureRate: failedImports.length / Math.max(1, importSuccesses + failedImports.length),
        mostAffectedPlatform: topDimension("platform"),
        mostAffectedVersion: topDimension("appVersion"),
        providerUsage,
      },
      dataQuality: {
        events30d: events.length,
        missingContext,
        delayed,
        unknownProperties,
        unknownEvents,
        integrations,
      },
    };
  },
});

const eventCounts = <T extends { name: string }>(events: T[], names: string[]) =>
  Object.fromEntries(names.map((name) => [name, events.filter((event) => event.name === name).length]));

export const users = internalQuery({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const needle = args.search?.trim().toLowerCase();
    const users = await ctx.db.query("users").order("desc").take(500);
    return users
      .filter((user) => !needle || [user.name, user.email, user.billingUserId]
        .some((value) => value?.toLowerCase().includes(needle)))
      .map((user) => ({
        id: user._id,
        billingUserId: user.billingUserId,
        name: user.name,
        email: user.email,
        plan: user.subscription,
        lifecycleStage: user.lifecycleStage,
        acquisitionSource: user.acquisitionSource,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt,
      }));
  },
});

export const userDetail = internalQuery({
  args: { billingUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users")
      .withIndex("by_billingUserId", (q) => q.eq("billingUserId", args.billingUserId))
      .unique();
    if (!user) return null;
    const [events, recipes, deliveries, devices, revenue, entitlements, imports] = await Promise.all([
      ctx.db.query("analyticsEvents").withIndex("by_user_occurredAt", (q) => q.eq("userId", user._id)).order("desc").take(200),
      ctx.db.query("recipes").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(100),
      ctx.db.query("campaignDeliveries").withIndex("by_user", (q) => q.eq("userId", user._id)).take(100),
      ctx.db.query("pushDevices").withIndex("by_user_enabled", (q) => q.eq("userId", user._id)).take(20),
      ctx.db.query("revenueEvents").withIndex("by_user_occurredAt", (q) => q.eq("userId", user._id)).order("desc").take(100),
      ctx.db.query("billingEntitlements").withIndex("by_user_status", (q) => q.eq("userId", user._id)).take(20),
      ctx.db.query("importOperations").withIndex("by_user_operation", (q) => q.eq("userId", user._id)).order("desc").take(100),
    ]);
    return {
      user,
      events,
      recipes: recipes.map((recipe) => ({
        id: recipe._id, title: recipe.title, category: recipe.category,
        createdAt: recipe.createdAt, updatedAt: recipe.updatedAt,
      })),
      deliveries,
      devices: devices.map((device) => ({
        platform: device.platform, enabled: device.enabled,
        appVersion: device.appVersion, lastSeenAt: device.lastSeenAt,
      })),
      revenue,
      entitlements,
      imports: imports.map((item) => ({
        operationId: item.operationId, provider: item.provider, status: item.status,
        errorCode: item.errorCode, createdAt: item.createdAt, updatedAt: item.updatedAt,
      })),
    };
  },
});

export const upsertRevenue = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("revenueEvents")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert("revenueEvents", args);
  },
});

export const addCost = internalMutation({
  args: {
    externalId: v.string(),
    provider: v.string(),
    category: v.string(),
    currency: v.string(),
    amount: v.number(),
    units: v.optional(v.number()),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("costEvents")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert("costEvents", args);
  },
});
