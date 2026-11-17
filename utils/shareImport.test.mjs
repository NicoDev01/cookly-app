import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  buildSharePollResponse,
  generateShareToken,
  hashShareToken,
  isValidInstallationId,
  mapShareImportError,
  parseBearerToken,
  parseShareImportBody,
  sharedTextFor,
} from "../convex/lib/shareImport.ts";
import { detectImportTarget } from "./importTarget.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("share tokens are 32 random bytes and stored only as SHA-256 hex", async () => {
  const token = generateShareToken();
  assert.match(token, /^cks_[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(token.slice(4), "base64url").length, 32);
  assert.notEqual(generateShareToken(), token);
  const hash = await hashShareToken(token);
  assert.equal(hash, createHash("sha256").update(token).digest("hex"));
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("bearer parsing accepts only well-formed share tokens", () => {
  const token = generateShareToken();
  assert.equal(parseBearerToken(`Bearer ${token}`), token);
  assert.equal(parseBearerToken(`bearer   ${token}`), token);
  assert.equal(parseBearerToken(null), null);
  assert.equal(parseBearerToken(""), null);
  assert.equal(parseBearerToken(token), null);
  assert.equal(parseBearerToken("Bearer "), null);
  assert.equal(parseBearerToken("Bearer cks_tooshort"), null);
  assert.equal(parseBearerToken(`Basic ${token}`), null);
  assert.equal(parseBearerToken(`Bearer ${token} extra`), null);
});

test("installation ids and request bodies are validated", () => {
  assert.ok(isValidInstallationId("6F9619FF-8B86-D011-B42D-00C04FC964FF"));
  assert.ok(!isValidInstallationId("short"));
  assert.ok(!isValidInstallationId("a".repeat(129)));
  assert.ok(!isValidInstallationId("with space 12345"));

  const body = { operationId: "id", url: "https://vm.tiktok.com/abc/", text: "Lecker", title: "Pasta" };
  assert.deepEqual(parseShareImportBody(body), body);
  assert.deepEqual(parseShareImportBody({ operationId: "id", url: "https://x.de" }), { operationId: "id", url: "https://x.de", text: undefined, title: undefined });
  assert.equal(parseShareImportBody(null), null);
  assert.equal(parseShareImportBody({ url: "https://x.de" }), null);
  assert.equal(parseShareImportBody({ operationId: "id", url: "" }), null);
  assert.equal(parseShareImportBody({ operationId: "id", url: "https://x.de", text: 5 }), null);
  assert.equal(parseShareImportBody({ operationId: "id", url: "x".repeat(2049) }), null);
});

test("shared text is combined like ShareTargetPage, so the platform link wins over a generic URL", () => {
  const page = read("pages/ShareTargetPage.tsx");
  assert.match(page, /detectImportTarget\(`\$\{searchParams\.get\('title'\) \|\| ''\} \$\{searchParams\.get\('text'\) \|\| ''\} \$\{searchParams\.get\('url'\) \|\| ''\}`\)/);
  assert.equal(sharedTextFor({ url: "https://x.de", title: "T" }), "T  https://x.de");
  const target = detectImportTarget(sharedTextFor({
    url: "https://example.com/landing",
    text: "Schau mal https://www.instagram.com/reel/ABC123/?igshid=1",
  }));
  assert.deepEqual(target, { provider: "instagram", url: "https://www.instagram.com/reel/ABC123/?igshid=1" });
});

test("import errors map to stable JSON responses", () => {
  const wrapped = (payload) => new Error(`Uncaught Error: ${payload}\n    at handler (../convex/importOperations.ts:273:11)`);
  assert.deepEqual(
    mapShareImportError(wrapped(JSON.stringify({ type: "LIMIT_REACHED", feature: "link_imports", current: 50, limit: 50 }))),
    { status: 402, body: { error: "LIMIT_REACHED", feature: "link_imports", current: 50, limit: 50 } },
  );
  assert.deepEqual(
    mapShareImportError(wrapped(JSON.stringify({ type: "RATE_LIMIT_EXCEEDED", resetAt: 123 }))),
    { status: 429, body: { error: "RATE_LIMIT_EXCEEDED", resetAt: 123 } },
  );
  assert.deepEqual(
    mapShareImportError(wrapped(JSON.stringify({ type: "PROVIDER_BUDGET_EXHAUSTED" }))),
    { status: 503, body: { error: "PROVIDER_BUDGET_EXHAUSTED" } },
  );
  assert.deepEqual(mapShareImportError(wrapped("INVALID_IMPORT_URL")), { status: 400, body: { error: "INVALID_IMPORT_URL" } });
  assert.deepEqual(mapShareImportError(new Error("Uncaught TypeError: Invalid URL")), { status: 400, body: { error: "INVALID_IMPORT_URL" } });
  assert.deepEqual(mapShareImportError(wrapped("INVALID_OPERATION_ID")), { status: 400, body: { error: "INVALID_OPERATION_ID" } });
  assert.deepEqual(mapShareImportError(wrapped("NOT_AUTHENTICATED")), { status: 401, body: { error: "UNAUTHORIZED" } });
  assert.deepEqual(mapShareImportError(new Error("socket hang up")), { status: 500, body: { error: "IMPORT_FAILED" } });
});

test("poll response shows the preview image while loading and the full recipe once succeeded", () => {
  const reserved = buildSharePollResponse({ operationId: "op", status: "reserved" }, null, null);
  assert.deepEqual(reserved, { operationId: "op", status: "reserved", phase: null, errorCode: null, previewImageUrl: null, recipe: null });
  const running = buildSharePollResponse({ operationId: "op", status: "running", phase: "extracting", previewImageUrl: "https://img" }, null, null);
  assert.deepEqual(running, { operationId: "op", status: "running", phase: "extracting", errorCode: null, previewImageUrl: "https://img", recipe: null });

  const failed = buildSharePollResponse({ operationId: "op", status: "failed", errorCode: "NO_RECIPE_CONTENT" }, null, null);
  assert.equal(failed.errorCode, "NO_RECIPE_CONTENT");
  assert.equal(failed.recipe, null);

  const recipe = {
    _id: "r1",
    userId: "u1",
    title: "Pasta",
    category: "Hauptgericht",
    portions: 4,
    prepTimeMinutes: 25,
    difficulty: "Einfach",
    sourceUrl: "https://x.de",
    ingredients: Array.from({ length: 7 }, (_, i) => ({ name: `Zutat ${i}`, amount: i % 2 ? `${i} g` : undefined, checked: false })),
    instructions: [{ text: "a", icon: "🔥" }, { text: "b" }, { text: "c" }],
  };
  // Ein Rezept ohne Erfolg (z. B. gelöscht) liefert keine Details.
  assert.equal(buildSharePollResponse({ operationId: "op", status: "running" }, recipe, null).recipe, null);

  const done = buildSharePollResponse({ operationId: "op", status: "succeeded", previewImageUrl: "https://img" }, recipe, "https://thumb");
  assert.equal(done.previewImageUrl, "https://img");
  assert.deepEqual(done.recipe, {
    recipeId: "r1",
    title: "Pasta",
    imageUrl: "https://thumb",
    category: "Hauptgericht",
    portions: 4,
    prepTimeMinutes: 25,
    ingredients: recipe.ingredients.map(({ name, amount }) => ({ name, amount: amount ?? null })),
    instructions: [{ text: "a" }, { text: "b" }, { text: "c" }],
  });
  assert.equal(done.recipe.ingredients.length, 7);
  // Nur die für die Ansicht nötigen Felder, keine internen.
  for (const field of ["checked", "userId", "sourceUrl", "icon", "difficulty"]) {
    assert.equal(JSON.stringify(done).includes(`"${field}"`), false, field);
  }
});

test("app and share extension start imports through the same core", () => {
  const operations = read("convex/importOperations.ts");
  const http = read("convex/http.ts");
  const tokens = read("convex/shareTokens.ts");
  const schema = read("convex/schema.ts");

  // Ein Kern für beide Wege, nur die Analytics unterscheiden sich.
  assert.equal(operations.match(/startLinkImportCore\(ctx, userId, args/g)?.length, 2);
  assert.match(operations, /return await startLinkImportCore\(ctx, userId, args\);/);
  assert.match(operations, /startLinkImportCore\(ctx, userId, args, "share_extension"\)/);
  // entryPoint steht an der Operation und damit an allen Import-Events (gestartet, erfolgreich, fehlgeschlagen).
  assert.match(operations, /feature,\n\s+entryPoint,/);
  assert.match(operations, /const properties = operation\.entryPoint \? \{ entryPoint: operation\.entryPoint, \.\.\.extraProperties \}/);
  assert.match(schema, /entryPoint: v\.optional\(v\.literal\("share_extension"\)\)/);
  assert.match(operations, /export const startImportForUser = internalMutation/);
  // Polling liest nur die eigene Operation.
  assert.match(operations, /getForShare = internalQuery[\s\S]*?by_user_operation", \(q\) => q\.eq\("userId", args\.userId\)/);

  // Token: nur Hash in der DB, Ablauf geprüft, gleitende Laufzeit, Aufräumen, Kontolöschung.
  assert.match(schema, /shareTokens: defineTable/);
  assert.doesNotMatch(tokens, /insert\("shareTokens", \{[^}]*\btoken,/);
  assert.match(tokens, /expiresAt <= Date\.now\(\)\) return null/);
  assert.match(read("convex/crons.ts"), /internal\.shareTokens\.cleanupExpired/);
  assert.match(read("convex/accountDeletion.ts"), /query\("shareTokens"\)\.withIndex\("by_user"/);

  // Beide Routen prüfen den Token vor allem anderen.
  const routes = http.slice(http.indexOf('path: "/share/import"'));
  assert.equal(routes.match(/if \(!session\) return unauthorized\(\);/g)?.length, 2);
  assert.match(http, /internal\.shareTokens\.touch/);
});
