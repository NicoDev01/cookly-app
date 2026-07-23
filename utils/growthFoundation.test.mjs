import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("growth events use one registry with shared identities", async () => {
  const [registry, analytics] = await Promise.all([
    source("analytics/eventRegistry.ts"),
    source("services/analytics.ts"),
  ]);
  assert.match(registry, /EVENT_NAMES/);
  assert.match(registry, /ALLOWED_EVENT_PROPERTIES/);
  for (const id of ["billingUserId", "anonymousId", "sessionId", "correlationId", "operationId"]) {
    assert.match(`${registry}\n${analytics}`, new RegExp(id));
  }
  assert.match(analytics, /posthog\.identify/);
  assert.match(analytics, /posthog\.reset/);
});

test("free usage keeps manual recipes unlimited and caps AI features at 60", async () => {
  const [constants, recipes, users] = await Promise.all([
    source("convex/constants.ts"),
    source("convex/recipes.ts"),
    source("convex/users.ts"),
  ]);
  assert.doesNotMatch(constants, /MANUAL_RECIPES/);
  assert.match(constants, /LINK_IMPORTS:\s*60/);
  assert.match(constants, /PHOTO_SCANS:\s*60/);
  assert.match(recipes, /featureType === "manual_recipes"/);
  assert.match(users, /Lebenslange Free-Counter/);
});

test("marketing and revenue schemas remain provider-neutral", async () => {
  const schema = await source("convex/schema.ts");
  for (const table of [
    "analyticsEvents", "integrationJobs", "campaigns", "campaignDeliveries",
    "pushDevices", "marketingSpend", "revenueEvents", "costEvents", "adRevenueDaily",
  ]) {
    assert.match(schema, new RegExp(`${table}: defineTable`));
  }
  const ads = await source("services/ads.ts");
  assert.match(ads, /disabledAdProvider/);
  assert.doesNotMatch(ads, /admob|initialize\(\)\s*\{[^}]*SDK/is);
});

test("admin APIs keep third-party keys on the local server", async () => {
  const [server, browser] = await Promise.all([
    source("admin-dashboard/server.mjs"),
    source("admin-dashboard/public/app.js"),
  ]);
  assert.match(server, /127\.0\.0\.1/);
  assert.match(server, /process\.env\.SENTRY_AUTH_TOKEN/);
  assert.match(server, /process\.env\.POSTHOG_PERSONAL_API_KEY/);
  assert.doesNotMatch(browser, /SENTRY_AUTH_TOKEN|POSTHOG_PERSONAL_API_KEY|STRIPE_SECRET_KEY/);
});

test("native push registration stays disabled until Firebase is configured", async () => {
  const push = await source("components/PushLifecycle.tsx");
  assert.match(push, /VITE_PUSH_NOTIFICATIONS_ENABLED\s*===\s*"true"/);
  assert.match(push, /if \(!pushEnabled \|\| !isAuthenticated/);
});

test("profile notification preference controls local and server notifications", async () => {
  const [profile, shareTarget, users, push, marketing] = await Promise.all([
    source("pages/ProfilePage.tsx"),
    source("pages/ShareTargetPage.tsx"),
    source("convex/users.ts"),
    source("convex/push.ts"),
    source("convex/marketing.ts"),
  ]);

  assert.ok(profile.indexOf("Konto löschen") < profile.indexOf('role="switch"'));
  assert.ok(profile.indexOf('role="switch"') < profile.indexOf("Datenschutz & Impressum"));
  assert.match(profile, /updateNotificationPreference/);
  assert.match(shareTarget, /user\?\.notificationsEnabled/);
  assert.match(users, /notificationsEnabled: enabled/);
  assert.match(push, /if \(!user\?\.notificationsEnabled\) return 0/);
  assert.match(marketing, /campaign\.channel === "push" && user\.notificationsEnabled/);
});
