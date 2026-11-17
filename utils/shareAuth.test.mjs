import test from "node:test";
import assert from "node:assert/strict";
import { SHARE_TOKEN_REFRESH_MS, convexSiteUrl, needsShareTokenRefresh } from "./shareAuth.ts";

test("convexSiteUrl maps the client URL to the HTTP-actions host", () => {
  assert.equal(convexSiteUrl("https://fabulous-minnow-835.convex.cloud"), "https://fabulous-minnow-835.convex.site");
  assert.equal(convexSiteUrl("https://fabulous-minnow-835.convex.cloud/"), "https://fabulous-minnow-835.convex.site");
  assert.equal(convexSiteUrl("http://fabulous-minnow-835.convex.cloud"), null);
  assert.equal(convexSiteUrl("https://example.com"), null);
  assert.equal(convexSiteUrl(undefined), null);
});

test("needsShareTokenRefresh issues for missing, foreign, moved or old tokens only", () => {
  const now = 1_800_000_000_000;
  const base = "https://a.convex.site";
  const fresh = { installationId: "inst-12345", hasToken: true, userId: "u1", apiBase: base, issuedAt: now - 1000 };
  assert.equal(needsShareTokenRefresh(fresh, "u1", base, now), false);
  assert.equal(needsShareTokenRefresh({ ...fresh, hasToken: false }, "u1", base, now), true);
  assert.equal(needsShareTokenRefresh(fresh, "u2", base, now), true);
  assert.equal(needsShareTokenRefresh(fresh, "u1", "https://b.convex.site", now), true);
  assert.equal(needsShareTokenRefresh({ ...fresh, issuedAt: undefined }, "u1", base, now), true);
  assert.equal(needsShareTokenRefresh({ ...fresh, issuedAt: now - SHARE_TOKEN_REFRESH_MS - 1 }, "u1", base, now), true);
});
