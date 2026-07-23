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
