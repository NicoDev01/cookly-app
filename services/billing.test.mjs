import test from "node:test";
import assert from "node:assert/strict";
import { resolveNativeBilling } from "./nativeBillingConfig.ts";

const ANDROID_ENV = {
  VITE_NATIVE_BILLING_ENABLED: "true",
  VITE_REVENUECAT_GOOGLE_API_KEY: "goog_KEY",
};

const IOS_ENV = {
  VITE_NATIVE_BILLING_IOS_ENABLED: "true",
  VITE_REVENUECAT_APPLE_API_KEY: "appl_KEY",
};

test("android keeps legacy flag and google key behavior", () => {
  assert.deepEqual(resolveNativeBilling("android", ANDROID_ENV), { enabled: true, apiKey: "goog_KEY" });
  assert.equal(resolveNativeBilling("android", {}).enabled, false);
  assert.equal(
    resolveNativeBilling("android", {
      VITE_NATIVE_BILLING_ENABLED: "true",
      VITE_REVENUECAT_GOOGLE_API_KEY: "",
    }).enabled,
    false,
  );
  assert.equal(resolveNativeBilling("android", { ...ANDROID_ENV, VITE_NATIVE_BILLING_ENABLED: "false" }).enabled, false);
});

test("ios uses its own flag and apple key", () => {
  assert.deepEqual(resolveNativeBilling("ios", IOS_ENV), { enabled: true, apiKey: "appl_KEY" });
  assert.equal(resolveNativeBilling("ios", {}).enabled, false);
  assert.equal(resolveNativeBilling("ios", { VITE_NATIVE_BILLING_IOS_ENABLED: "true" }).enabled, false);
});

test("platform flags do not leak across platforms", () => {
  const iosWithAndroidEnv = resolveNativeBilling("ios", ANDROID_ENV);
  const androidWithIosEnv = resolveNativeBilling("android", IOS_ENV);
  assert.equal(iosWithAndroidEnv.enabled, false);
  assert.equal(iosWithAndroidEnv.apiKey, undefined);
  assert.equal(androidWithIosEnv.enabled, false);
  assert.equal(androidWithIosEnv.apiKey, undefined);
});

test("web never enables native billing", () => {
  assert.deepEqual(resolveNativeBilling("web", { ...ANDROID_ENV, ...IOS_ENV }), { enabled: false });
});
