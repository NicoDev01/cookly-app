import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("storage assets bind uploads to purpose, owner, and cleanup", () => {
  const schema = read("convex/schema.ts");
  const assets = read("convex/storageAssets.ts");
  const recipes = read("convex/recipes.ts");
  const scan = read("convex/photoScan.ts");
  const deletion = read("convex/accountDeletion.ts");
  const crons = read("convex/crons.ts");

  assert.match(schema, /storageAssets: defineTable/);
  assert.match(schema, /index\("by_storageId", \["storageId"\]\)/);
  assert.match(assets, /ctx\.db\.system\.get\("_storage", storageId\)/);
  assert.match(assets, /consumeRateLimit\(ctx, userId, "upload"\)/);
  assert.match(assets, /STORAGE_NOT_OWNED/);
  assert.match(recipes, /claimRecipeAsset\(ctx, userId, args\.imageStorageId, recipeId\)/);
  assert.match(scan, /internal\.storageAssets\.getPendingPhotoScanForUser/);
  assert.match(scan, /internal\.storageAssets\.releasePendingAssetForUser/);
  assert.match(deletion, /query\("storageAssets"\)/);
  assert.match(deletion, /\.take\(DELETE_BATCH_SIZE\)/);
  assert.match(crons, /internal\.storageAssets\.cleanupExpired/);
});
