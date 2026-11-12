import assert from "node:assert/strict";
import test from "node:test";

import { compareVersions, isUpdateRequired, storeOffersUpdate } from "./requiredUpdate.ts";

const AVAILABLE = 2;
const NOT_AVAILABLE = 1;

test("compareVersions vergleicht numerisch, nicht als Text", () => {
  assert.equal(compareVersions("1.5.10", "1.5.9"), 1);
  assert.equal(compareVersions("1.5", "1.5.0"), 0);
  assert.equal(compareVersions("1.4.20", "1.5.0"), -1);
});

test("ohne Mindestversion gibt es nie ein Pflicht-Update", () => {
  assert.equal(isUpdateRequired("android", null, { currentVersionName: "1.0.0", updateAvailability: AVAILABLE }), false);
  assert.equal(isUpdateRequired("ios", "", { currentVersionName: "1.0.0", availableVersionName: "9.9.9" }), false);
});

test("Android: unter Mindestversion und Play bietet Update an -> sperren", () => {
  assert.equal(isUpdateRequired("android", "1.5.1", { currentVersionName: "1.5.0", updateAvailability: AVAILABLE }), true);
});

test("Android: Play bietet noch nichts an (Rollout) -> nicht sperren", () => {
  assert.equal(isUpdateRequired("android", "1.5.1", { currentVersionName: "1.5.0", updateAvailability: NOT_AVAILABLE }), false);
});

test("bereits auf Mindestversion -> nicht sperren", () => {
  assert.equal(isUpdateRequired("android", "1.5.1", { currentVersionName: "1.5.1", updateAvailability: AVAILABLE }), false);
  assert.equal(isUpdateRequired("ios", "1.5.1", { currentVersionName: "1.6.0", availableVersionName: "1.6.0" }), false);
});

test("iOS: App Store hat neuere Version -> sperren, sonst nicht", () => {
  assert.equal(isUpdateRequired("ios", "1.5.1", { currentVersionName: "1.5.0", availableVersionName: "1.5.1" }), true);
  assert.equal(storeOffersUpdate("ios", { currentVersionName: "1.5.0", availableVersionName: "1.5.0" }), false);
  assert.equal(storeOffersUpdate("ios", { currentVersionName: "1.5.0" }), false);
});

test("Web sperrt nie", () => {
  assert.equal(isUpdateRequired("web", "9.0.0", { currentVersionName: "1.0.0", updateAvailability: AVAILABLE }), false);
});
