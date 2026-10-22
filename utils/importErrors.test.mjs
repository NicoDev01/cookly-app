import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importErrorCode } from "../convex/lib/importErrors.ts";

test("structured errors wrapped by runAction keep their type", () => {
  const wrapped = new Error('Uncaught Error: {"type":"NO_RECIPE_CONTENT","message":"Aus dem Instagram-Text konnte kein strukturiertes Rezept erstellt werden."}');
  assert.equal(importErrorCode(wrapped), "NO_RECIPE_CONTENT");
  assert.equal(importErrorCode(new Error('{"type":"API_UNAVAILABLE","service":"gemini"}')), "API_UNAVAILABLE");
});

test("plain error codes are extracted without surrounding noise", () => {
  assert.equal(importErrorCode(new Error("Uncaught Error: INVALID_INSTAGRAM_URL")), "INVALID_INSTAGRAM_URL");
  assert.equal(importErrorCode(new Error("Uncaught Error: NOT_AUTHENTICATED")), "NOT_AUTHENTICATED");
});

test("unknown errors fall back to IMPORT_FAILED", () => {
  assert.equal(importErrorCode(new Error("socket hang up")), "IMPORT_FAILED");
  assert.equal(importErrorCode(new Error("Uncaught Error: {not json}")), "IMPORT_FAILED");
});

test("social import retries Gemini and reports overload as API_UNAVAILABLE", () => {
  const source = readFileSync(new URL("../convex/socialImport.ts", import.meta.url), "utf8");
  assert.match(source, /runWithGeminiModelFallback\(GEMINI_MODELS\.recipeTextExtraction/);
  assert.match(source, /if \(isRetryableGeminiError\(geminiError\)\) throw geminiUnavailableError/);
});
