import assert from "node:assert/strict";
import test from "node:test";
import {
  getNestedValue,
  normalizeInstructionIcon,
  uniqueNonEmpty,
} from "../convex/socialImportShared.ts";

test("social import helpers preserve nested extraction, order and icon fallback", () => {
  const post = { media: [{ image: { url: "https://example.com/food.jpg" } }] };

  assert.equal(getNestedValue(post, "media[0].image.url"), "https://example.com/food.jpg");
  assert.deepEqual(uniqueNonEmpty([" Rezept ", "", "Rezept", "Zutaten"]), ["Rezept", "Zutaten"]);
  assert.equal(normalizeInstructionIcon("invalid", "Im Ofen backen"), "oven_gen");
});
