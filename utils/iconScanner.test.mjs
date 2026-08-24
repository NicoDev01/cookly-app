import assert from "node:assert/strict";
import test from "node:test";
import { collectIconNames } from "../scripts/lib/collect-icon-names.mjs";
import { MATERIAL_SYMBOLS_ALLOWLIST } from "../utils/iconUtils.ts";
import { ALLOWED_MATERIAL_ICONS } from "../convex/socialImportShared.ts";

/**
 * Der Font-Subset wird aus dem Scanner-Ergebnis gebaut (fonts:sync) und im
 * Build dagegen geprüft (fonts:check). Fällt eine Icon-Quelle unter den Tisch,
 * rendert die App statt des Glyphs rohen Ligatur-Text - dieser Test stellt
 * sicher, dass die beiden Allowlists dem Scanner bekannt bleiben. Auslöser war
 * ein Regex, der an `new Set<string>([` scheiterte und deshalb 5 Icons des
 * Foto-Scan-Pfads nicht subsettete.
 */
test("Icon-Scanner sieht jede Allowlist-Quelle vollständig", () => {
  const hits = collectIconNames();

  const missingFrontend = [...MATERIAL_SYMBOLS_ALLOWLIST].filter((name) => !hits.has(name));
  assert.deepEqual(missingFrontend, [], "Frontend-Allowlist muss komplett gescannt werden");

  const missingBackend = [...ALLOWED_MATERIAL_ICONS].filter((name) => !hits.has(name));
  assert.deepEqual(missingBackend, [], "Backend-Allowlist (Social-/Website-Import) muss komplett gescannt werden");
});
