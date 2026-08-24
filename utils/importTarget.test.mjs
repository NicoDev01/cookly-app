import assert from "node:assert/strict";
import test from "node:test";
import { detectImportTarget } from "./importTarget.ts";

test("erkennt geteilte TikTok-Links inklusive Kurzlinks", () => {
  const cases = [
    "https://www.tiktok.com/@mascha_wassermelone/video/7673045152113495329",
    "https://vm.tiktok.com/ZGxABCdef/",
    "https://vt.tiktok.com/ZSxABCdef/",
    "https://www.tiktok.com/t/ZTxABCdef/",
    "https://m.tiktok.com/@user/video/123456",
  ];

  for (const url of cases) {
    const target = detectImportTarget(`Schau dir das an ${url} #rezept`);
    assert.equal(target?.provider, "tiktok", `sollte TikTok erkennen: ${url}`);
    assert.equal(target?.url, url);
  }
});

test("TikTok gewinnt gegen den generischen URL-Fallback", () => {
  // Vor dem TikTok-Support landete genau dieser Fall beim Website-Import (Jina) und schlug fehl.
  const target = detectImportTarget("https://www.tiktok.com/@koch/video/999 ansehen");
  assert.equal(target?.provider, "tiktok");
});

test("hält die bestehende Instagram- und Facebook-Erkennung ein", () => {
  assert.deepEqual(
    detectImportTarget("Rezept https://www.instagram.com/reel/DUIdyKlDOaX/?igsh=abc"),
    { provider: "instagram", url: "https://www.instagram.com/reel/DUIdyKlDOaX/?igsh=abc" },
  );
  assert.equal(detectImportTarget("https://www.instagram.com/p/ABC123/").provider, "instagram");
  assert.equal(detectImportTarget("https://www.instagram.com/share/reel/XyZ/").provider, "instagram");
  assert.equal(detectImportTarget("https://www.facebook.com/share/r/1AiDe5uE4M/").provider, "facebook");
  assert.equal(detectImportTarget("https://fb.watch/abc123/").provider, "facebook");
});

test("fällt für alles andere auf den Website-Import zurück", () => {
  assert.deepEqual(
    detectImportTarget("Lecker: https://www.chefkoch.de/rezepte/123/Lasagne.html"),
    { provider: "website", url: "https://www.chefkoch.de/rezepte/123/Lasagne.html" },
  );
});

test("liefert null ohne URL im geteilten Text", () => {
  assert.equal(detectImportTarget("nur Text ohne Link"), null);
  assert.equal(detectImportTarget(""), null);
});
