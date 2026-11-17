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

test("kein Rezepttext: Hashtags, Erwähnungen und Links zählen nicht", async () => {
  const { meaningfulLetterCount, MIN_RECIPE_TEXT_LETTERS } = await import("../convex/socialImportShared.ts");
  // Echter Fall 2026-11-17: ASMR-Video, nur Hashtags plus Musiktitel aus der Transkription.
  const asmr = "#asmar #asmreating #mukbangreatingshow #tiktokfood #cooking\n\n---\n\nSora no Kokoro";
  assert.ok(meaningfulLetterCount(asmr) < MIN_RECIPE_TEXT_LETTERS);
  assert.ok(meaningfulLetterCount("@koch_max https://example.com/rezept #pasta") < MIN_RECIPE_TEXT_LETTERS);
  assert.ok(meaningfulLetterCount("Spaghetti Carbonara 🍝 #pasta") >= MIN_RECIPE_TEXT_LETTERS);
  assert.ok(meaningfulLetterCount("200 g Mehl, 3 Eier, 400 ml Milch") >= MIN_RECIPE_TEXT_LETTERS);
});
