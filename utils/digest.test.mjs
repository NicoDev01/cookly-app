import test from "node:test";
import assert from "node:assert/strict";
import { berlinOffsetHours, berlinTime, digestWarnings, isDigestHour, renderDigest } from "../convex/digestModel.ts";

const base = () => ({
  windowStart: Date.UTC(2026, 9, 21, 6),
  windowEnd: Date.UTC(2026, 9, 22, 6),
  users: { total: 15, new: 1, active: 4 },
  subscriptions: { activeByProvider: { app_store: 1 }, purchases: 1, cancellations: 0, expirations: 0 },
  imports: { started: 10, succeeded: 9, failed: 1, topError: { code: "NO_RECIPE_FOUND", count: 1 } },
  providerUsage: [{ provider: "apify", day: "2026-10-21", used: 10, limit: 1000 }],
  integrationFailures: [],
  failedAccountDeletions: 0,
});

test("berlin offset follows EU daylight saving switch at 01:00 UTC", () => {
  assert.equal(berlinOffsetHours(Date.UTC(2026, 2, 29, 0, 59)), 1);
  assert.equal(berlinOffsetHours(Date.UTC(2026, 2, 29, 1, 0)), 2);
  assert.equal(berlinOffsetHours(Date.UTC(2026, 9, 25, 0, 59)), 2);
  assert.equal(berlinOffsetHours(Date.UTC(2026, 9, 25, 1, 0)), 1);
});

test("exactly one of the two cron runs hits 08:00 German time", () => {
  for (const day of [Date.UTC(2026, 6, 1), Date.UTC(2026, 11, 1)]) {
    const hits = [6, 7].filter((hour) => isDigestHour(day + hour * 3_600_000));
    assert.equal(hits.length, 1);
  }
  assert.equal(berlinTime(Date.UTC(2026, 6, 1, 6)).hour, 8);
  assert.equal(berlinTime(Date.UTC(2026, 11, 1, 7)).hour, 8);
});

test("quiet day renders without warnings", () => {
  assert.deepEqual(digestWarnings(base()), []);
  const { subject, html } = renderDigest(base());
  assert.match(subject, /Alles ok – Cookly 2026-10-22/);
  assert.match(html, /App Store 1/);
});

test("thresholds produce warnings", () => {
  const data = base();
  data.imports = { started: 10, succeeded: 6, failed: 4 };
  data.providerUsage = [{ provider: "gemini", day: "2026-10-21", used: 900, limit: 1000 }];
  data.integrationFailures = [{ provider: "brevo", count: 3, lastError: "BREVO_API_KEY not configured" }];
  data.failedAccountDeletions = 1;
  const warnings = digestWarnings(data);
  assert.equal(warnings.length, 4);
  assert.match(renderDigest(data).subject, /4 Warnungen/);
});

test("few finished imports do not trigger the failure-rate warning", () => {
  const data = base();
  data.imports = { started: 2, succeeded: 1, failed: 1 };
  assert.deepEqual(digestWarnings(data), []);
});

test("external error text is HTML-escaped", () => {
  const data = base();
  data.integrationFailures = [{ provider: "fcm", count: 1, lastError: "<script>alert(1)</script>" }];
  const { html } = renderDigest(data);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
