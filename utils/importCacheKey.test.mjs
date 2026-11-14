import assert from "node:assert/strict";
import test from "node:test";
import { cacheRecipeFromPayload, importCacheEnabled, socialCacheKey, websiteCacheKey } from "../convex/lib/importCacheKey.ts";

test("Website-Schlüssel: Tracking fällt weg, Host/Slash/Hash normalisiert", () => {
  const base = websiteCacheKey("https://www.chefkoch.de/rezepte/123/salat.html");
  assert.equal(base, "web:chefkoch.de/rezepte/123/salat.html");
  assert.equal(websiteCacheKey("http://WWW.Chefkoch.de/rezepte/123/salat.html/?utm_source=x&fbclid=1#zutaten"), base);
  assert.equal(websiteCacheKey("https://chefkoch.de/rezepte/123/salat.html?igsh=abc&mc_eid=1&si=2"), base);
});

test("Website-Schlüssel: andere Parameter bleiben, damit private oder ID-Links nie kollidieren", () => {
  const a = websiteCacheKey("https://example.com/rezept?id=1&token=abc");
  const b = websiteCacheKey("https://example.com/rezept?id=2&token=abc");
  const c = websiteCacheKey("https://example.com/rezept?token=abc&id=1");
  assert.notEqual(a, b);
  assert.equal(a, c, "Reihenfolge egal");
  assert.notEqual(websiteCacheKey("https://example.com/Rezept"), websiteCacheKey("https://example.com/rezept"), "Pfad unterscheidet Groß/Klein");
  assert.notEqual(websiteCacheKey("https://example.com:8443/a"), websiteCacheKey("https://example.com/a"));
});

test("Website-Schlüssel: ungültige oder riskante URLs werden nicht gecacht", () => {
  assert.equal(websiteCacheKey(undefined), null);
  assert.equal(websiteCacheKey("kein link"), null);
  assert.equal(websiteCacheKey("ftp://example.com/a"), null);
  assert.equal(websiteCacheKey("https://user:pw@example.com/a"), null);
  assert.equal(websiteCacheKey("http://localhost/a"), null);
});

test("Social-Schlüssel nur mit eindeutiger Beitrags-ID", () => {
  assert.equal(socialCacheKey("instagram", "DQx1abcDEF"), "instagram:DQx1abcDEF");
  assert.equal(socialCacheKey("tiktok", "7696865131501833494"), "tiktok:7696865131501833494");
  assert.equal(socialCacheKey("tiktok", ""), null);
  assert.equal(socialCacheKey("tiktok", "a/b"), null);
  assert.equal(socialCacheKey("website", "abcdef"), null);
});

test("Cache übernimmt nur vollständige Rezeptfelder, nie Nutzerdaten", () => {
  const recipe = cacheRecipeFromPayload({
    title: " Lasagne ", category: "Pasta", prepTimeMinutes: 60, difficulty: "Mittel", portions: 4,
    ingredients: [{ name: "Nudeln", amount: "500 g", checked: true }, { name: "Salz", amount: "" }],
    instructions: [{ text: "Kochen", icon: "skillet" }],
    isFavorite: true, userId: "u1", notes: "privat", sourceUrl: "https://x.de/a", image: "https://x.de/b.jpg",
  });
  assert.deepEqual(recipe, {
    title: "Lasagne", category: "Pasta", prepTimeMinutes: 60, difficulty: "Mittel", portions: 4,
    ingredients: [{ name: "Nudeln", amount: "500 g" }, { name: "Salz" }],
    instructions: [{ text: "Kochen", icon: "skillet" }],
  });
  assert.equal(cacheRecipeFromPayload({ ...recipe, ingredients: [{ name: "Nur eins" }] }), null);
  assert.equal(cacheRecipeFromPayload({ ...recipe, instructions: [] }), null);
  assert.equal(cacheRecipeFromPayload({ ...recipe, difficulty: "Profi" }), null);
  assert.equal(cacheRecipeFromPayload(null), null);
});

test("Abschalter per Env", () => {
  assert.equal(importCacheEnabled(undefined), true);
  assert.equal(importCacheEnabled("FALSE"), false);
});
