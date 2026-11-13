import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('imports are idempotent, reserved before scheduling, and not called directly by clients', () => {
  const operations = read('convex/importOperations.ts');
  const schema = read('convex/schema.ts');
  const clients = read('pages/ShareTargetPage.tsx') + read('components/AddRecipeModal.tsx');

  assert.match(schema, /importOperations: defineTable/);
  assert.match(schema, /apiRateLimits: defineTable/);
  assert.match(schema, /providerDailyUsage: defineTable/);
  assert.match(operations, /by_user_operation/);
  assert.match(operations, /current \+ active >= featureLimit/);
  assert.match(operations, /scheduler\.runAfter\(0, internal\.importOperations\.runImport/);
  assert.match(operations, /operation\.status === "succeeded"/);
  assert.doesNotMatch(clients, /api\.(instagram|facebook|website|photoScan)\./);
});

test('photo scan of several pages runs as one import and one Gemini request', () => {
  const operations = read('convex/importOperations.ts');
  const photoScan = read('convex/photoScan.ts');
  const shared = read('convex/photoScanShared.ts');
  const client = read('components/addRecipe/usePhotoScan.ts');

  // Seiten 2..n hängen an derselben Operation, nur für Foto-Scans, begrenzt und ohne Duplikate.
  assert.match(operations, /MAX_EXTRA_PHOTO_PAGES = 2/);
  assert.match(operations, /PHOTO_PAGES_ONLY_FOR_SCAN/);
  assert.match(operations, /DUPLICATE_PHOTO_PAGE/);
  assert.match(operations, /extraStorageIds: operation\.extraSourceAssetIds/);
  // Alle Seiten in einem Request, mit Hinweis, dass es ein Rezept ist.
  assert.match(photoScan, /\[args\.storageId, \.\.\.\(args\.extraStorageIds \?\? \[\]\)\]|storageIds = \[args\.storageId/);
  assert.match(photoScan, /AI_SCAN_MULTI_PAGE_HINT/);
  assert.match(shared, /export const AI_SCAN_MULTI_PAGE_HINT/);
  // Client: über importOperations, Gerichtsfoto als Rezeptbild, nie direkt api.photoScan.
  assert.match(client, /api\.importOperations\.startImport/);
  assert.match(client, /extraAssetIds: pageIds\.slice\(1\)/);
  // Server legt das Rezept an (saveRecipe), Gerichtsfoto als Rezeptbild; alte Clients bekommen weiter den Entwurf.
  assert.match(client, /saveRecipe: true/);
  assert.match(client, /dishImage: dish/);
  assert.doesNotMatch(client, /api\.recipes\.create/);
  assert.match(operations, /if \(operation\.saveRecipe\)/);
  assert.match(operations, /imageStorageId: dish\.storageId/);
  assert.match(operations, /resultDraft: args\.resultDraft/);
  // Warten per Abo statt Polling.
  assert.match(read('utils/importOperationClient.ts'), /watchQuery\(api\.importOperations\.get/);
  assert.doesNotMatch(client, /api\.(instagram|facebook|website|photoScan)\./);
});
