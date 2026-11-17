import assert from "node:assert/strict";
import test from "node:test";
import { failingPlatforms, pickCanarySamples } from "../convex/lib/importCanaryModel.ts";
import { digestWarnings, renderDigest, summarizeImportPaths } from "../convex/digestModel.ts";

test("Kontroll-Check: jüngste Beiträge je Plattform, höchstens drei, ohne Websites", () => {
  const samples = pickCanarySamples([
    { key: "instagram:AAAAA1", provider: "instagram" },
    { key: "web:chefkoch.de/rezepte/1", provider: "website" },
    { key: "tiktok:7700000000000000001", provider: "tiktok" },
    { key: "instagram:AAAAA2", provider: "instagram" },
    { key: "instagram:AAAAA2", provider: "instagram" },
    { key: "instagram:AAAAA3", provider: "instagram" },
    { key: "instagram:AAAAA4", provider: "instagram" },
    { key: "facebook:123456", provider: "facebook" },
  ]);
  assert.deepEqual(samples, { instagram: ["AAAAA1", "AAAAA2", "AAAAA3"], tiktok: ["7700000000000000001"] });
});

test("Kontroll-Check: Ausfall nur, wenn alle (mind. zwei) Beiträge scheitern", () => {
  assert.deepEqual(failingPlatforms({ instagram: [false, false, false], tiktok: [true, false] }), ["instagram"]);
  assert.deepEqual(failingPlatforms({ instagram: [false, true, false], tiktok: [false, false] }), ["tiktok"]);
  assert.deepEqual(failingPlatforms({ instagram: [false], tiktok: [] }), [], "zu wenige Stichproben");
});

const event = (provider, winner, durationMs, fastPath) => ({ properties: { provider, winner, durationMs, ...(fastPath && { fastPath }) } });

test("Digest: Schnellweg-Anteil und Median je Anbieter, Warnung bei Ausfall", () => {
  const paths = summarizeImportPaths([
    event("instagram", "page", 2000, "hit"),
    event("instagram", "primary", 11000, "none"),
    event("instagram", "primary", 12000, "error"),
    event("instagram", "primary", 13000, "none"),
    event("instagram", "cache", 300),
    event("tiktok", "page", 4000),
    event("website", undefined, 2000),
  ]);
  assert.deepEqual(paths[0], { provider: "instagram", succeeded: 5, fast: 1, cache: 1, medianMs: 11000 });
  assert.deepEqual(paths.find((p) => p.provider === "tiktok"), { provider: "tiktok", succeeded: 1, fast: 1, cache: 0, medianMs: 4000 });

  const data = {
    windowStart: 0, windowEnd: Date.UTC(2026, 10, 17, 7),
    users: { total: 1, new: 0, active: 1 },
    subscriptions: { activeByProvider: {}, purchases: 0, cancellations: 0, expirations: 0 },
    imports: { started: 7, succeeded: 7, failed: 0 },
    importPaths: paths, providerUsage: [], integrationFailures: [], failedAccountDeletions: 0,
  };
  assert.deepEqual(digestWarnings(data), ["instagram: Schnellweg nur bei 1 von 4 Imports (25 %), Rest über Apify"]);
  assert.match(renderDigest(data).html, /instagram.*5 ok · Schnellweg 1 · Cache 1 · Median 11\.0 s/);
  assert.deepEqual(digestWarnings({ ...data, importPaths: summarizeImportPaths([event("instagram", "primary", 1), event("instagram", "page", 1)]) }), [], "zu wenige Imports");
});
