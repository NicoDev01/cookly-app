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
    ["convex/tiktok.ts", "scrapePost", "scrapePostInternal"],
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

test("link importers are routed and registered for every supported provider", () => {
  // `internal.<modul>` ist in den generierten Typen lose typisiert — tsc fängt einen
  // Tippfehler hier NICHT. Deshalb wird die Verdrahtung auf Quelltextebene geprüft.
  const operations = read("convex/importOperations.ts");
  const schema = read("convex/schema.ts");

  for (const provider of ["instagram", "facebook", "tiktok"]) {
    assert.ok(
      operations.includes(`${provider}: internal.${provider}.scrapePostInternal`),
      `importOperations muss ${provider} auf internal.${provider}.scrapePostInternal routen`,
    );
    assert.ok(operations.includes(`v.literal("${provider}")`), `provider-Union muss ${provider} kennen`);
    assert.ok(schema.includes(`v.literal("${provider}")`), `Schema muss ${provider} kennen`);
  }

  // Jede Plattform braucht einen Rate-Limit-Bucket, sonst schlägt startImport zur Laufzeit fehl.
  const rateLimiter = read("convex/rateLimiter.ts");
  for (const bucket of ["instagram", "facebook", "tiktok"]) {
    assert.ok(rateLimiter.includes(`v.literal("${bucket}")`), `Rate-Limit-Bucket ${bucket} fehlt`);
  }
});

test("remote image proxy allows the CDN hosts of every social provider", () => {
  // Ohne Host-Allowlist wird jedes Coverbild blockiert und still durch ein KI-Bild ersetzt.
  const policy = read("convex/lib/remoteImagePolicy.ts");
  for (const host of ["cdninstagram.com", "fbcdn.net", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com"]) {
    assert.ok(policy.includes(`"${host}"`), `remoteImagePolicy muss ${host} erlauben`);
  }
  assert.match(read("convex/remoteImages.ts"), /hostMatchesSuffix\(sourceHost, "tiktok\.com"\)/);
});
