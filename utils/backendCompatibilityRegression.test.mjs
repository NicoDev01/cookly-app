import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("installed app versions keep their legacy backend contracts", () => {
  const operations = read("convex/importOperations.ts");
  const legacyImport = read("convex/legacyImport.ts");
  const photoScan = read("convex/photoScan.ts");
  const recipes = read("convex/recipes.ts");
  const storageAssets = read("convex/storageAssets.ts");
  const users = read("convex/users.ts");

  for (const [file, publicName, internalName] of [
    ["convex/instagram.ts", "scrapePost", "scrapePostInternal"],
    ["convex/facebook.ts", "scrapePost", "scrapePostInternal"],
    ["convex/website.ts", "scrapeWebsite", "scrapeWebsiteInternal"],
  ]) {
    const source = read(file);
    assert.match(source, new RegExp(`export const ${publicName} = action`));
    assert.match(source, new RegExp(`export const ${internalName} = internalAction`));
  }

  assert.match(operations, /runImmediately: v\.optional\(v\.boolean\(\)\)/);
  assert.match(legacyImport, /api\.importOperations\.startImport/);
  assert.match(legacyImport, /internal\.importOperations\.runImport/);
  for (const endpoint of [
    "generateImageUploadUrl",
    "generateAndStoreAiImage",
    "proxyExternalImage",
    "proxyExternalImages",
  ]) {
    assert.match(recipes, new RegExp(`export const ${endpoint} =`));
  }
  assert.match(photoScan, /export const scanRecipePhoto = action/);
  assert.match(photoScan, /internal\.photoScan\.scanRecipePhotoInternal/);
  assert.match(operations, /internal\.photoScan\.scanRecipePhotoInternal/);
  assert.match(storageAssets, /asset \?\?= await registerAsset\(ctx, userId, storageId, "recipe_image"\)/);
  assert.match(users, /export const deleteCurrentUser = mutation/);
  assert.match(users, /internal\.accountDeletion\.requestDeletionForAuth/);
  for (const field of ["cookingFrequency", "preferredCuisines", "notificationsEnabled"]) {
    assert.match(users, new RegExp(`${field}: v\\.optional`));
  }
});
