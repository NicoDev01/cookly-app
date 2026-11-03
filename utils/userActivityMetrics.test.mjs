import test from "node:test";
import assert from "node:assert/strict";

import { aggregate, buildUserRows, normalizeErrorCode, recipeSource, weekStart } from "../scripts/lib/userActivityMetrics.mjs";

const at = (iso) => Date.parse(iso);

test("recipeSource classifies link, photo and manual recipes", () => {
  assert.equal(recipeSource({ sourceUrl: "https://www.instagram.com/reel/x" }), "instagram");
  assert.equal(recipeSource({ sourceUrl: "https://m.facebook.com/x" }), "facebook");
  assert.equal(recipeSource({ sourceUrl: "https://vm.tiktok.com/x" }), "tiktok");
  assert.equal(recipeSource({ sourceUrl: "https://chefkoch.de/x" }), "website");
  assert.equal(recipeSource({ sourceImageUrl: "https://storage/x.jpg" }), "photo");
  assert.equal(recipeSource({}), "manual");
});

test("normalizeErrorCode extracts the type from raw error messages", () => {
  assert.equal(normalizeErrorCode('Uncaught Error: {"type":"NO_RECIPE_CONTENT","message":"x"}'), "NO_RECIPE_CONTENT");
  assert.equal(normalizeErrorCode("API_UNAVAILABLE"), "API_UNAVAILABLE");
  assert.equal(normalizeErrorCode(undefined), "UNBEKANNT");
});

test("weekStart returns the Monday of the week", () => {
  assert.equal(weekStart("2026-11-03"), "2026-11-02");
  assert.equal(weekStart("2026-11-08"), "2026-11-02");
});

test("users are segmented by return behaviour and internal accounts are flagged", () => {
  const rows = buildUserRows({
    now: at("2026-11-03T12:00:00Z"),
    internalEmails: ["@test.de"],
    users: [
      { _id: "once", email: "a@gmail.com", name: "A", createdAt: at("2026-10-01T10:00:00Z") },
      { _id: "back", email: "b@gmail.com", name: "B", createdAt: at("2026-10-01T10:00:00Z"), onboardingCompleted: true },
      { _id: "never", email: "c@test.de", name: "C", createdAt: at("2026-10-01T10:00:00Z") },
      { _id: "back2", email: "B@gmail.com", name: "B", createdAt: at("2026-10-20T10:00:00Z") },
    ],
    recipes: [
      { userId: "once", sourceUrl: "https://instagram.com/p/1", createdAt: at("2026-10-01T11:00:00Z") },
      { userId: "back", sourceImageUrl: "x", createdAt: at("2026-10-01T11:00:00Z") },
      { userId: "back2", sourceUrl: "https://chefkoch.de/r", createdAt: at("2026-11-02T11:00:00Z") },
    ],
    events: [
      { userId: "back", name: "import_failed", properties: { errorCode: "NO_RECIPE_CONTENT" }, occurredAt: at("2026-11-02T11:00:00Z") },
      { name: "synthetic_health_check", occurredAt: at("2026-11-02T11:00:00Z") },
    ],
    weeklyMeals: [{ userId: "back", createdAt: at("2026-11-02T12:00:00Z") }],
    shoppingItems: [],
  });
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

  assert.equal(rows.length, 3);
  assert.equal(byId.back.accounts, 2);
  assert.equal(byId.back.recipes, 2);
  assert.equal(byId.once.segment, "once");
  assert.equal(byId.back.segment, "active");
  assert.equal(byId.back.returnedAfter7d, true);
  assert.equal(byId.never.segment, "never");
  assert.equal(byId.never.internal, true);
  assert.equal(byId.back.recipesBySource.photo, 1);
  assert.equal(byId.back.importErrors.NO_RECIPE_CONTENT, 1);

  const summary = aggregate(rows.filter((row) => !row.internal));
  assert.equal(summary.users, 2);
  assert.equal(summary.recipes, 3);
  assert.equal(summary.recipesPerWeek.length, 6, "Wochen ohne Rezepte werden mit 0 aufgefüllt");
  assert.deepEqual(summary.segments, { never: 0, once: 1, returned: 0, active: 1 });
  assert.deepEqual(summary.funnel.find(([step]) => step === "Nach 7+ Tagen zurückgekommen"), ["Nach 7+ Tagen zurückgekommen", 1]);
});
