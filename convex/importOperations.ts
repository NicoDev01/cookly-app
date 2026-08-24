import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { FREE_LIMITS } from "./constants";
import { consumeProviderBudget, consumeRateLimit, type ProviderBudget, type RateLimitBucket } from "./rateLimiter";
import { adjustCategoryCount, ensureCategoryExists, insertRecipe } from "./recipes";
import { storeAnalyticsEvent } from "./analytics";
import { enqueueIntegration } from "./integrations";

const provider = v.union(
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("tiktok"),
  v.literal("website"),
  v.literal("photo_scan"),
);
const photoFallback = v.object({
  title: v.string(),
  category: v.string(),
  prepTimeMinutes: v.number(),
  difficulty: v.union(v.literal("Einfach"), v.literal("Mittel"), v.literal("Schwer")),
  portions: v.number(),
  image: v.string(),
  imageAlt: v.string(),
});
const ACTIVE_TTL_MS = 15 * 60_000;
const RESULT_TTL_MS = 24 * 60 * 60_000;

type Provider = "instagram" | "facebook" | "tiktok" | "website" | "photo_scan";
type Feature = "link_imports" | "photo_scans";

async function resolveUserId(ctx: QueryCtx | MutationCtx, authUserId: Id<"users">) {
  const linked = await ctx.db.query("users")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
    .first();
  return linked?._id ?? authUserId;
}

function normalizeUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("INVALID_IMPORT_URL");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "fbclid" || key === "igshid") url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  return url.href;
}

function supportsProvider(value: Exclude<Provider, "photo_scan">, sourceUrl: string) {
  const host = new URL(sourceUrl).hostname;
  if (value === "instagram") return host === "instagram.com" || host.endsWith(".instagram.com");
  if (value === "facebook") return host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch";
  if (value === "tiktok") return host === "tiktok.com" || host.endsWith(".tiktok.com");
  return true;
}

async function urlHash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function usage(user: Doc<"users">, feature: Feature) {
  return feature === "link_imports" ? user.usageStats?.linkImports ?? 0 : user.usageStats?.photoScans ?? 0;
}

function limit(feature: Feature) {
  return feature === "link_imports" ? FREE_LIMITS.LINK_IMPORTS : FREE_LIMITS.PHOTO_SCANS;
}

async function incrementUsage(ctx: Parameters<typeof insertRecipe>[0], user: Doc<"users">, feature: Feature) {
  if ((user.subscription ?? "free") !== "free") return;
  const stats = user.usageStats ?? {};
  const next = usage(user, feature) + 1;
  await ctx.db.patch(user._id, {
    usageStats: {
      ...stats,
      ...(feature === "link_imports"
        ? { linkImports: next }
        : { photoScans: next }),
    },
    updatedAt: Date.now(),
  });
  if (user.email && (next === 48 || next === limit(feature))) {
    const event = next === 48 ? "cookly_limit_warning" : "cookly_limit_reached";
    await enqueueIntegration(ctx, "brevo", "event", `${event}:${user._id}:${feature}`, {
      event_name: event,
      identifiers: { email_id: user.email },
      contact_properties: { COOKLY_USER_ID: user.billingUserId ?? String(user._id) },
      event_properties: { feature, current: next, limit: limit(feature) },
    });
  }
}

function providerCosts(value: Provider): ProviderBudget[] {
  if (value === "website") return ["jina", "gemini"];
  if (value === "photo_scan") return ["gemini", "gemini", "gemini"];
  if (value === "instagram") return ["apify", "apify", "gemini", "gemini"];
  // TikTok: ein Actor-Run, optional ein zweiter mit Transkription.
  if (value === "tiktok") return ["apify", "apify", "gemini", "gemini"];
  return ["apify", "apify", "gemini"];
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(message) as { type?: string };
    if (parsed.type) return parsed.type.slice(0, 80);
  } catch { /* use stable fallback below */ }
  return /INVALID_|NO_RECIPE|NOT_AUTHENTICATED/.test(message) ? message.slice(0, 80) : "IMPORT_FAILED";
}

async function trackImport(
  ctx: MutationCtx,
  user: Doc<"users">,
  operation: Doc<"importOperations">,
  name: string,
  properties: Record<string, unknown> = {},
) {
  const occurredAt = Date.now();
  await storeAnalyticsEvent(ctx, {
    eventId: `${operation.operationId}:${name}`,
    name,
    version: 1,
    userId: user._id,
    billingUserId: user.billingUserId,
    correlationId: operation.operationId,
    operationId: operation.operationId,
    platform: "server",
    properties: {
      provider: operation.provider,
      durationMs: occurredAt - operation.createdAt,
      ...properties,
    },
    occurredAt,
  });
  await enqueueIntegration(ctx, "posthog", "event", `${operation.operationId}:${name}`, {
    event: name,
    distinct_id: user.billingUserId ?? String(user._id),
    properties: {
      operationId: operation.operationId,
      correlationId: operation.operationId,
      provider: operation.provider,
      durationMs: occurredAt - operation.createdAt,
      ...properties,
    },
    personProperties: { plan: user.subscription ?? "free" },
    timestamp: new Date(occurredAt).toISOString(),
  });
  if (user.email && ["import_succeeded", "import_failed"].includes(name)) {
    await enqueueIntegration(ctx, "brevo", "event", `${operation.operationId}:brevo:${name}`, {
      event_name: `cookly_${name}`,
      identifiers: { email_id: user.email },
      contact_properties: { COOKLY_USER_ID: user.billingUserId ?? String(user._id) },
      event_properties: { operationId: operation.operationId, provider: operation.provider, ...properties },
    });
  }
  await ctx.scheduler.runAfter(0, internal.integrations.processJobs);
}

export const startImport = mutation({
  args: {
    operationId: v.string(),
    provider,
    url: v.optional(v.string()),
    sourceAssetId: v.optional(v.id("_storage")),
    input: v.optional(photoFallback),
    runImmediately: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("NOT_AUTHENTICATED");
    const userId = await resolveUserId(ctx, authUserId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args.operationId)) {
      throw new Error("INVALID_OPERATION_ID");
    }

    const existing = await ctx.db.query("importOperations")
      .withIndex("by_user_operation", (q) => q.eq("userId", userId).eq("operationId", args.operationId))
      .unique();
    if (existing) return { operationId: existing.operationId, status: existing.status, userId };

    const feature: Feature = args.provider === "photo_scan" ? "photo_scans" : "link_imports";
    if (feature === "photo_scans" && !args.sourceAssetId) throw new Error("PHOTO_ASSET_REQUIRED");
    if (feature === "link_imports" && !args.url) throw new Error("IMPORT_URL_REQUIRED");

    const sourceUrl = args.url ? normalizeUrl(args.url) : undefined;
    if (sourceUrl && args.provider !== "photo_scan" && !supportsProvider(args.provider, sourceUrl)) {
      throw new Error("INVALID_IMPORT_URL");
    }
    if (feature === "photo_scans") {
      const asset = await ctx.db.query("storageAssets")
        .withIndex("by_storageId", (q) => q.eq("storageId", args.sourceAssetId!))
        .first();
      if (!asset || asset.userId !== userId || asset.purpose !== "photo_scan" || asset.state !== "pending") {
        throw new Error("STORAGE_NOT_OWNED");
      }
    }
    const canonicalUrlHash = sourceUrl ? await urlHash(sourceUrl) : undefined;
    if (canonicalUrlHash) {
      const duplicates = await ctx.db.query("importOperations")
        .withIndex("by_user_canonicalUrlHash", (q) => q.eq("userId", userId).eq("canonicalUrlHash", canonicalUrlHash))
        .order("desc")
        .take(10);
      const duplicate = duplicates.find((item) => ["reserved", "running", "succeeded"].includes(item.status));
      if (duplicate) {
        return { operationId: duplicate.operationId, status: duplicate.status, userId };
      }
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("NOT_AUTHENTICATED");
    const active = (await Promise.all(["reserved", "running"].map((status) =>
      ctx.db.query("importOperations")
        .withIndex("by_user_feature_status", (q) => q.eq("userId", userId).eq("feature", feature).eq("status", status as "reserved" | "running"))
        .collect()
    ))).flat().length;
    const current = usage(user, feature);
    const featureLimit = limit(feature);
    if ((user.subscription ?? "free") === "free" && current + active >= featureLimit) {
      throw new Error(JSON.stringify({ type: "LIMIT_REACHED", feature, current, limit: featureLimit }));
    }

    const bucket = (args.provider === "photo_scan" ? "photo" : args.provider) as RateLimitBucket;
    const rate = await consumeRateLimit(ctx, userId, bucket);
    if (!rate.allowed) throw new Error(JSON.stringify({ type: "RATE_LIMIT_EXCEEDED", resetAt: rate.resetAt }));
    for (const cost of providerCosts(args.provider)) {
      if (!await consumeProviderBudget(ctx, cost)) {
        throw new Error(JSON.stringify({ type: "PROVIDER_BUDGET_EXHAUSTED" }));
      }
    }

    const now = Date.now();
    const operationId = await ctx.db.insert("importOperations", {
      userId,
      operationId: args.operationId,
      provider: args.provider,
      feature,
      canonicalUrlHash,
      sourceUrl,
      sourceAssetId: args.sourceAssetId,
      input: args.input,
      status: "reserved",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ACTIVE_TTL_MS,
    });
    const operation = await ctx.db.get(operationId);
    if (operation) await trackImport(ctx, user, operation, "import_started");
    if (!args.runImmediately) {
      await ctx.scheduler.runAfter(0, internal.importOperations.runImport, { userId, operationId: args.operationId });
    }
    return { operationId: args.operationId, status: "reserved" as const, userId };
  },
});

export const get = query({
  args: { operationId: v.string() },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return null;
    const userId = await resolveUserId(ctx, authUserId);
    const operation = await ctx.db.query("importOperations")
      .withIndex("by_user_operation", (q) => q.eq("userId", userId).eq("operationId", args.operationId))
      .unique();
    if (!operation) return null;
    return {
      operationId: operation.operationId,
      status: operation.status,
      resultRecipeId: operation.resultRecipeId,
      resultDraft: operation.resultDraft,
      errorCode: operation.errorCode,
      updatedAt: operation.updatedAt,
    };
  },
});

export const markRunning = internalMutation({
  args: { userId: v.id("users"), operationId: v.string() },
  handler: async (ctx, args) => {
    const operation = await ctx.db.query("importOperations")
      .withIndex("by_user_operation", (q) => q.eq("userId", args.userId).eq("operationId", args.operationId))
      .unique();
    if (!operation || !["reserved", "running"].includes(operation.status)) return null;
    const now = Date.now();
    await ctx.db.patch(operation._id, { status: "running", updatedAt: now, expiresAt: now + ACTIVE_TTL_MS });
    return operation;
  },
});

export const completeLink = internalMutation({
  args: {
    userId: v.id("users"),
    operationId: v.string(),
    recipeId: v.optional(v.id("recipes")),
    staleRecipeId: v.optional(v.id("recipes")),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const operation = await ctx.db.query("importOperations")
      .withIndex("by_user_operation", (q) => q.eq("userId", args.userId).eq("operationId", args.operationId))
      .unique();
    if (!operation) throw new Error("IMPORT_OPERATION_NOT_FOUND");
    if (operation.status === "succeeded") return operation.resultRecipeId;
    if (operation.status !== "running") throw new Error("IMPORT_OPERATION_NOT_RUNNING");

    let recipeId = args.recipeId;
    if (!recipeId && args.payload) {
      if (args.staleRecipeId) {
        const stale = await ctx.db.get(args.staleRecipeId);
        if (!stale || stale.userId !== args.userId) throw new Error("RECIPE_NOT_OWNED");
        const payload = {
          ...args.payload,
          ingredients: args.payload.ingredients.map((ingredient: { name: string; amount?: string; checked?: boolean }) => ({
            ...ingredient,
            checked: ingredient.checked ?? false,
          })),
        };
        await ctx.db.patch(stale._id, { ...payload, updatedAt: Date.now() });
        if (stale.category !== payload.category) {
          await adjustCategoryCount(ctx, stale.category, -1, args.userId);
          await adjustCategoryCount(ctx, payload.category, 1, args.userId);
          await ensureCategoryExists(ctx, payload.category, args.userId);
        }
        recipeId = stale._id;
      } else {
        recipeId = await insertRecipe(ctx, args.userId, args.payload);
        await adjustCategoryCount(ctx, args.payload.category, 1, args.userId);
        await ensureCategoryExists(ctx, args.payload.category, args.userId);
      }
    }
    if (!recipeId) throw new Error("IMPORT_RESULT_MISSING");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("NOT_AUTHENTICATED");
    if (!args.recipeId) await incrementUsage(ctx, user, "link_imports");
    const now = Date.now();
    await ctx.db.patch(operation._id, {
      status: "succeeded",
      resultRecipeId: recipeId,
      input: undefined,
      sourceUrl: undefined,
      committedAt: now,
      updatedAt: now,
      expiresAt: now + RESULT_TTL_MS,
    });
    await ctx.db.patch(user._id, {
      firstRecipeAt: user.firstRecipeAt ?? now,
      lastRecipeAt: now,
      lastImportAt: now,
      lifecycleStage: "engaged",
      updatedAt: now,
    });
    await trackImport(ctx, user, operation, "import_succeeded", { recipeId: String(recipeId), recipeCreated: !args.recipeId });
    await ctx.scheduler.runAfter(0, internal.remoteImages.proxyImportedImage, {
      userId: args.userId,
      recipeId,
    });
    return recipeId;
  },
});

export const completePhoto = internalMutation({
  args: { userId: v.id("users"), operationId: v.string(), resultDraft: v.any() },
  handler: async (ctx, args) => {
    const operation = await ctx.db.query("importOperations")
      .withIndex("by_user_operation", (q) => q.eq("userId", args.userId).eq("operationId", args.operationId))
      .unique();
    if (!operation) throw new Error("IMPORT_OPERATION_NOT_FOUND");
    if (operation.status === "succeeded") return;
    if (operation.status !== "running") throw new Error("IMPORT_OPERATION_NOT_RUNNING");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("NOT_AUTHENTICATED");
    await incrementUsage(ctx, user, "photo_scans");
    const now = Date.now();
    await ctx.db.patch(operation._id, {
      status: "succeeded",
      resultDraft: args.resultDraft,
      input: undefined,
      sourceUrl: undefined,
      sourceAssetId: undefined,
      committedAt: now,
      updatedAt: now,
      expiresAt: now + RESULT_TTL_MS,
    });
    await ctx.db.patch(user._id, { lastImportAt: now, updatedAt: now });
    await trackImport(ctx, user, operation, "import_ai_completed");
  },
});

export const fail = internalMutation({
  args: { userId: v.id("users"), operationId: v.string(), errorCode: v.string() },
  handler: async (ctx, args) => {
    const operation = await ctx.db.query("importOperations")
      .withIndex("by_user_operation", (q) => q.eq("userId", args.userId).eq("operationId", args.operationId))
      .unique();
    if (!operation || operation.status === "succeeded") return;
    const now = Date.now();
    await ctx.db.patch(operation._id, { status: "failed", errorCode: args.errorCode, input: undefined, sourceUrl: undefined, sourceAssetId: undefined, updatedAt: now, expiresAt: now + RESULT_TTL_MS });
    const user = await ctx.db.get(args.userId);
    if (user) await trackImport(ctx, user, operation, "import_failed", { errorCode: args.errorCode });
  },
});

export const runImport = internalAction({
  args: { userId: v.id("users"), operationId: v.string() },
  handler: async (ctx, args) => {
    const operation = await ctx.runMutation(internal.importOperations.markRunning, args);
    if (!operation) return;
    try {
      if (operation.provider === "photo_scan") {
        const result = await ctx.runAction(internal.photoScan.scanRecipePhotoInternal, {
          userId: args.userId,
          storageId: operation.sourceAssetId!,
          fallback: operation.input,
        });
        await ctx.runMutation(internal.importOperations.completePhoto, { ...args, resultDraft: result.doc });
        return;
      }
      const linkImporters = {
        instagram: internal.instagram.scrapePostInternal,
        facebook: internal.facebook.scrapePostInternal,
        tiktok: internal.tiktok.scrapePostInternal,
      } as const;
      const target = linkImporters[operation.provider as keyof typeof linkImporters]
        ?? internal.website.scrapeWebsiteInternal;
      const result = await ctx.runAction(target, { userId: args.userId, url: operation.sourceUrl! });
      await ctx.runMutation(internal.importOperations.completeLink, { ...args, ...result });
    } catch (error) {
      await ctx.runMutation(internal.importOperations.fail, { ...args, errorCode: errorCode(error) });
    }
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let cleaned = 0;
    for (const status of ["reserved", "running", "succeeded", "failed", "released"] as const) {
      const operations = await ctx.db.query("importOperations")
        .withIndex("by_status_expiresAt", (q) => q.eq("status", status).lt("expiresAt", now))
        .take(100);
      for (const operation of operations) {
        if (status === "running" && operation.updatedAt > now - ACTIVE_TTL_MS) continue;
        if (["succeeded", "failed", "released"].includes(status)) await ctx.db.delete(operation._id);
        else await ctx.db.patch(operation._id, { status: "released", input: undefined, sourceUrl: undefined, sourceAssetId: undefined, errorCode: "IMPORT_EXPIRED", updatedAt: now });
        cleaned++;
      }
    }
    return cleaned;
  },
});

export async function deleteUserImportOperations(ctx: Parameters<typeof insertRecipe>[0], userId: Id<"users">) {
  for (const operation of await ctx.db.query("importOperations").withIndex("by_user_operation", (q) => q.eq("userId", userId)).collect()) {
    await ctx.db.delete(operation._id);
  }
  for (const row of await ctx.db.query("apiRateLimits").withIndex("by_user_bucket", (q) => q.eq("userId", userId)).collect()) {
    await ctx.db.delete(row._id);
  }
}
