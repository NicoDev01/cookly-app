import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { consumeRateLimit } from "./rateLimiter";

const PENDING_TTL_MS = 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_SCAN_BYTES = 15 * 1024 * 1024;

const purposeValidator = v.union(
  v.literal("recipe_image"),
  v.literal("category_image"),
  v.literal("photo_scan"),
  v.literal("ai_generated"),
  v.literal("imported_image"),
);

type AssetPurpose = typeof purposeValidator.type;
type AssetCtx = MutationCtx;

async function getCurrentUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) throw new Error("Not authenticated");
  return await getUserIdByAuthUserId(ctx, authUserId.toString());
}

async function getUserIdByAuthUserId(ctx: QueryCtx | MutationCtx, authUserId: string): Promise<Id<"users">> {
  const linked = await ctx.db
    .query("users")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId))
    .first();
  if (linked) return linked._id;

  const authUser = await ctx.db.get(authUserId as Id<"users">);
  if (authUser) return authUser._id;
  throw new Error("User not found");
}

function maxBytesFor(purpose: AssetPurpose) {
  return purpose === "photo_scan" ? MAX_SCAN_BYTES : MAX_IMAGE_BYTES;
}

function assertImageMetadata(metadata: { contentType?: string; size?: number } | null, purpose: AssetPurpose) {
  if (!metadata || !metadata.contentType?.startsWith("image/")) throw new Error("INVALID_STORAGE_ASSET");
  if ((metadata.size ?? 0) > maxBytesFor(purpose)) throw new Error("STORAGE_ASSET_TOO_LARGE");
}

async function registerAsset(
  ctx: AssetCtx,
  userId: Id<"users">,
  storageId: Id<"_storage">,
  purpose: AssetPurpose,
) {
  const existing = await ctx.db
    .query("storageAssets")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (existing) {
    if (existing.userId !== userId) throw new Error("STORAGE_NOT_OWNED");
    return existing;
  }

  const metadata = await ctx.db.system.get("_storage", storageId);
  try {
    assertImageMetadata(metadata, purpose);
  } catch (error) {
    await ctx.storage.delete(storageId).catch(() => undefined);
    throw error;
  }
  const now = Date.now();
  const assetId = await ctx.db.insert("storageAssets", {
    storageId,
    userId,
    purpose,
    state: "pending",
    contentType: metadata.contentType,
    sizeBytes: metadata.size,
    sha256: metadata.sha256,
    createdAt: now,
    expiresAt: now + PENDING_TTL_MS,
  });
  return await ctx.db.get(assetId);
}

export async function claimRecipeAsset(
  ctx: AssetCtx,
  userId: Id<"users">,
  storageId: Id<"_storage">,
  recipeId: Id<"recipes">,
) {
  let asset = await ctx.db
    .query("storageAssets")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  // Older installed clients upload directly and cannot register the asset.
  asset ??= await registerAsset(ctx, userId, storageId, "recipe_image");
  if (!asset || asset.userId !== userId) throw new Error("STORAGE_NOT_OWNED");
  if (asset.state === "claimed" && asset.recipeId === recipeId) return;
  if (asset.state !== "pending") throw new Error("STORAGE_ASSET_NOT_PENDING");
  if (!["recipe_image", "ai_generated", "imported_image"].includes(asset.purpose)) {
    throw new Error("STORAGE_ASSET_PURPOSE_INVALID");
  }
  await ctx.db.patch(asset._id, { state: "claimed", recipeId, claimedAt: Date.now(), expiresAt: undefined });
}

export async function deleteTrackedAsset(ctx: AssetCtx, userId: Id<"users">, storageId: Id<"_storage">) {
  const asset = await ctx.db
    .query("storageAssets")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (!asset) return false; // Legacy assets remain supported by their owner record.
  if (asset.userId !== userId) throw new Error("STORAGE_NOT_OWNED");
  await ctx.storage.delete(storageId);
  await ctx.db.delete(asset._id);
  return true;
}

export async function deleteAllTrackedAssets(ctx: AssetCtx, userId: Id<"users">) {
  for (const state of ["pending", "claimed", "released"] as const) {
    const assets = await ctx.db
      .query("storageAssets")
      .withIndex("by_user_state", (q) => q.eq("userId", userId).eq("state", state))
      .collect();
    for (const asset of assets) {
      try {
        await ctx.storage.delete(asset.storageId);
      } catch {
        // Delete the registry entry even when the storage object is already gone.
      }
      await ctx.db.delete(asset._id);
    }
  }
}

export const generateUploadUrl = mutation({
  args: { purpose: purposeValidator },
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    const rateLimit = await consumeRateLimit(ctx, userId, "upload");
    if (!rateLimit.allowed) throw new Error("RATE_LIMIT_EXCEEDED");
    return await ctx.storage.generateUploadUrl();
  },
});

export const registerUploadedAsset = mutation({
  args: { storageId: v.id("_storage"), purpose: purposeValidator },
  handler: async (ctx, args) => registerAsset(ctx, await getCurrentUserId(ctx), args.storageId, args.purpose),
});

export const getPendingPhotoScan = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const asset = await ctx.db
      .query("storageAssets")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!asset || asset.userId !== await getCurrentUserId(ctx) || asset.purpose !== "photo_scan" || asset.state !== "pending") {
      throw new Error("STORAGE_NOT_OWNED");
    }
    return asset;
  },
});

export const getPendingPhotoScanForUser = internalQuery({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.query("storageAssets")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!asset || asset.userId !== args.userId || asset.purpose !== "photo_scan" || asset.state !== "pending") {
      throw new Error("STORAGE_NOT_OWNED");
    }
    return asset;
  },
});

export const releasePendingAsset = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    const asset = await ctx.db
      .query("storageAssets")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!asset || asset.userId !== userId || asset.state !== "pending") return false;
    await ctx.db.patch(asset._id, { state: "released", expiresAt: Date.now() });
    return true;
  },
});

export const releasePendingAssetForUser = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.query("storageAssets")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!asset || asset.userId !== args.userId || asset.state !== "pending") return false;
    await ctx.db.patch(asset._id, { state: "released", expiresAt: Date.now() });
    return true;
  },
});

export const registerServerAsset = internalMutation({
  args: { storageId: v.id("_storage"), authUserId: v.string(), purpose: purposeValidator },
  handler: async (ctx, args) => registerAsset(ctx, await getUserIdByAuthUserId(ctx, args.authUserId), args.storageId, args.purpose),
});

export const registerServerAssetForUser = internalMutation({
  args: { storageId: v.id("_storage"), userId: v.id("users"), purpose: purposeValidator },
  handler: async (ctx, args) => registerAsset(ctx, args.userId, args.storageId, args.purpose),
});

export const discardServerAsset = internalMutation({
  args: { storageId: v.id("_storage"), authUserId: v.string() },
  handler: async (ctx, args) => deleteTrackedAsset(ctx, await getUserIdByAuthUserId(ctx, args.authUserId), args.storageId),
});

export const discardServerAssetForUser = internalMutation({
  args: { storageId: v.id("_storage"), userId: v.id("users") },
  handler: async (ctx, args) => deleteTrackedAsset(ctx, args.userId, args.storageId),
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("storageAssets")
      .withIndex("by_state_expiresAt", (q) => q.eq("state", "pending").lt("expiresAt", now))
      .take(100);
    const released = await ctx.db
      .query("storageAssets")
      .withIndex("by_state_expiresAt", (q) => q.eq("state", "released").lte("expiresAt", now))
      .take(100 - pending.length);
    let deleted = 0;
    for (const asset of [...pending, ...released]) {
      try {
        await ctx.storage.delete(asset.storageId);
      } catch {
        // The object may already have been removed; its registry entry must still disappear.
      }
      await ctx.db.delete(asset._id);
      deleted++;
    }
    return { deleted };
  },
});

export const backfillReferencedAssets = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 100, 1), 500);
    const now = Date.now();
    let claimed = 0;
    const add = async (
      storageId: Id<"_storage">,
      userId: Id<"users">,
      purpose: AssetPurpose,
      owner: { recipeId?: Id<"recipes">; categoryId?: Id<"categories"> },
    ) => {
      const existing = await ctx.db
        .query("storageAssets")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first();
      if (existing) return;
      const metadata = await ctx.db.system.get("_storage", storageId);
      try {
        assertImageMetadata(metadata, purpose);
      } catch {
        return;
      }
      await ctx.db.insert("storageAssets", {
        storageId,
        userId,
        purpose,
        state: "claimed",
        ...owner,
        contentType: metadata.contentType,
        sizeBytes: metadata.size,
        sha256: metadata.sha256,
        createdAt: now,
        claimedAt: now,
      });
      claimed++;
    };

    const recipes = await ctx.db.query("recipes").take(batchSize);
    for (const recipe of recipes) {
      if (recipe.userId && recipe.imageStorageId) {
        await add(recipe.imageStorageId, recipe.userId, "recipe_image", { recipeId: recipe._id });
      }
    }
    const categories = await ctx.db.query("categories").take(batchSize);
    for (const category of categories) {
      if (category.userId && category.imageStorageId) {
        await add(category.imageStorageId, category.userId, "category_image", { categoryId: category._id });
      }
    }
    return { claimed };
  },
});
