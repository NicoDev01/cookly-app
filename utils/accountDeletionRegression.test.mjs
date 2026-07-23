import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("account deletion completes billing before local cleanup and remains retryable", () => {
  const deletion = read("convex/accountDeletion.ts");
  const schema = read("convex/schema.ts");
  const stripe = read("convex/stripe.ts");
  const profile = read("pages/ProfilePage.tsx");

  assert.match(schema, /accountDeletionRequests: defineTable/);
  assert.ok(deletion.indexOf("internal.stripe.deleteCustomer") < deletion.indexOf("internal.accountDeletion.deleteLocalData"));
  assert.match(deletion, /BILLING_CLEANUP_FAILED/);
  assert.match(deletion, /DELETE_BATCH_SIZE = 50/);
  assert.match(deletion, /while \(!done\)/);
  assert.match(deletion, /\.take\(DELETE_BATCH_SIZE\)/);
  const batchedCleanup = deletion.slice(
    deletion.indexOf("export const deleteLocalData"),
    deletion.indexOf("export const isStripeCustomerDeleting"),
  );
  assert.doesNotMatch(batchedCleanup, /\.collect\(\)/);
  assert.match(stripe, /isStripeCustomerDeleting/);
  assert.match(profile, /deletionRequestIdRef\.current \?\?= createUuid\(\)/);
  assert.doesNotMatch(profile, /api\.users\.deleteCurrentUser/);
});
