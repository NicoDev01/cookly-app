import test from "node:test";
import assert from "node:assert/strict";
import { entitlementIsValid, hasAnyValidEntitlement, mapRevenueCatEvent } from "../convex/billingModel.ts";

const products = { monthly: new Set(["cookly_pro:monthly"]), yearly: new Set(["cookly_pro:yearly"]) };
const event = (type, extra = {}) => ({
  id: `event-${type}`,
  type,
  event_timestamp_ms: Date.now(),
  store: "PLAY_STORE",
  environment: "SANDBOX",
  app_user_id: "billing-user",
  entitlement_ids: ["pro"],
  product_id: "cookly_pro:monthly",
  original_transaction_id: "purchase-token",
  expiration_at_ms: Date.now() + 60_000,
  ...extra,
});

test("active and canceled entitlements remain valid only through their paid period", () => {
  assert.equal(entitlementIsValid("active"), true);
  assert.equal(entitlementIsValid("active", Date.now() - 1_000), false);
  assert.equal(entitlementIsValid("canceled", Date.now() + 1_000), true);
  assert.equal(entitlementIsValid("canceled", Date.now() - 1_000), false);
  assert.equal(entitlementIsValid("expired", Date.now() + 1_000), false);
});

test("RevenueCat lifecycle events map to server entitlement states", () => {
  assert.equal(mapRevenueCatEvent(event("INITIAL_PURCHASE"), products).status, "active");
  assert.equal(mapRevenueCatEvent(event("CANCELLATION"), products).status, "canceled");
  assert.equal(mapRevenueCatEvent(event("CANCELLATION", { cancel_reason: "CUSTOMER_SUPPORT" }), products).status, "expired");
  assert.equal(mapRevenueCatEvent(event("BILLING_ISSUE", { grace_period_expiration_at_ms: Date.now() + 60_000 }), products).status, "grace_period");
  assert.equal(mapRevenueCatEvent(event("EXPIRATION"), products).status, "expired");
});

test("one active provider keeps Pro when another provider expires", () => {
  assert.equal(hasAnyValidEntitlement([{ status: "expired" }, { status: "active" }]), true);
  assert.equal(hasAnyValidEntitlement([{ status: "expired" }, { status: "canceled", periodEnd: Date.now() - 1 }]), false);
});

test("unknown products fail closed", () => {
  assert.throws(() => mapRevenueCatEvent(event("INITIAL_PURCHASE", { product_id: "unknown" }), products), /UNKNOWN_REVENUECAT_PRODUCT/);
  assert.throws(() => mapRevenueCatEvent(event("INITIAL_PURCHASE", { environment: "UNKNOWN" }), products), /INVALID_REVENUECAT_ENVIRONMENT/);
});
