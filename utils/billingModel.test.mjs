import test from "node:test";
import assert from "node:assert/strict";
import { entitlementIsValid, hasAnyValidEntitlement, mapRevenueCatEvent, mapRevenueCatSubscription, pickProSubscription, sanitizeConvexValue } from "../convex/billingModel.ts";

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

test("sanitizeConvexValue drops reserved $ keys from RevenueCat attributes", () => {
  const payload = { event: { id: "e1", subscriber_attributes: { $attConsentStatus: { value: "notDetermined" }, name: { value: "Nico" } }, aliases: ["a", "b"] } };
  assert.deepEqual(sanitizeConvexValue(payload), { event: { id: "e1", subscriber_attributes: { name: { value: "Nico" } }, aliases: ["a", "b"] } });
});

test("pickProSubscription prefers the store subscription that grants pro", () => {
  const pro = { lookup_key: "pro" };
  const items = [
    { store: "stripe", gives_access: true, entitlements: { items: [pro] } },
    { store: "app_store", gives_access: false, ends_at: 5, entitlements: { items: [pro] } },
    { store: "app_store", gives_access: true, ends_at: 3, entitlements: { items: [pro] } },
    { store: "play_store", gives_access: true, entitlements: { items: [{ lookup_key: "other" }] } },
  ];
  assert.equal(pickProSubscription(items), items[2]);
  assert.equal(pickProSubscription([]), null);
});

test("mapRevenueCatSubscription maps v2 status fields", () => {
  const base = { store: "app_store", environment: "sandbox", status: "active", gives_access: true, auto_renewal_status: "will_renew", current_period_ends_at: 1000 };
  const yearly = mapRevenueCatSubscription(base, products, "cookly_pro:yearly");
  assert.deepEqual([yearly.provider, yearly.plan, yearly.status, yearly.environment, yearly.periodEnd], ["app_store", "pro_yearly", "active", "sandbox", 1000]);
  assert.equal(mapRevenueCatSubscription({ ...base, auto_renewal_status: "will_not_renew" }, products, undefined).status, "canceled");
  assert.equal(mapRevenueCatSubscription({ ...base, gives_access: false, status: "expired" }, products, undefined).status, "expired");
  assert.equal(mapRevenueCatSubscription({ ...base, status: "in_grace_period" }, products, undefined).status, "grace_period");
  assert.equal(mapRevenueCatSubscription(base, products, undefined, "pro_yearly").plan, "pro_yearly");
});
