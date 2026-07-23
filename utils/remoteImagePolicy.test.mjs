import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_REMOTE_IMAGE_REDIRECTS,
  assertContentLength,
  assertPublicAddresses,
  readLimitedBody,
  validateImageType,
  validateRedirect,
  validateRemoteUrl,
} from "../convex/lib/remoteImagePolicy.ts";

const hasCode = (code) => (error) => error?.code === code;

test("blocks local, private and obfuscated network targets", () => {
  for (const url of [
    "https://127.0.0.1/image.jpg",
    "https://[::1]/image.jpg",
    "https://2130706433/image.jpg",
    "https://0x7f000001/image.jpg",
    "https://localhost/image.jpg",
    "https://169.254.169.254/latest/meta-data",
  ]) assert.throws(() => validateRemoteUrl(url, "website"), hasCode("REMOTE_IMAGE_BLOCKED"));
});

test("enforces provider host suffixes on label boundaries", () => {
  assert.equal(validateRemoteUrl("https://scontent.cdninstagram.com/image.jpg", "instagram").hostname, "scontent.cdninstagram.com");
  assert.throws(
    () => validateRemoteUrl("https://evilcdninstagram.com/image.jpg", "instagram"),
    hasCode("REMOTE_IMAGE_BLOCKED"),
  );
});

test("blocks a DNS answer when any address is non-public", () => {
  assert.doesNotThrow(() => assertPublicAddresses(["8.8.8.8", "2606:4700:4700::1111"]));
  assert.throws(
    () => assertPublicAddresses(["8.8.8.8", "10.0.0.5"]),
    hasCode("REMOTE_IMAGE_BLOCKED"),
  );
});

test("revalidates redirects and caps their count", () => {
  const current = new URL("https://example.com/image.jpg");
  assert.throws(
    () => validateRedirect(current, "https://127.0.0.1/private", "website", 0),
    hasCode("REMOTE_IMAGE_BLOCKED"),
  );
  assert.throws(
    () => validateRedirect(current, "/next", "website", MAX_REMOTE_IMAGE_REDIRECTS),
    hasCode("REMOTE_IMAGE_REDIRECT"),
  );
});

test("rejects oversized bodies with and without Content-Length", async () => {
  assert.throws(() => assertContentLength("11", 10), hasCode("REMOTE_IMAGE_TOO_LARGE"));
  async function* body() {
    yield new Uint8Array(6);
    yield new Uint8Array(5);
  }
  await assert.rejects(() => readLimitedBody(body(), 10), hasCode("REMOTE_IMAGE_TOO_LARGE"));
});

test("accepts supported image signatures", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(validateImageType("image/jpeg", jpeg), "image/jpeg");
  assert.equal(validateImageType("image/png", png), "image/png");
  assert.equal(validateImageType("image/webp", webp), "image/webp");
});

test("rejects HTML, SVG and MIME/signature mismatches", () => {
  const html = new TextEncoder().encode("<html></html>");
  const svg = new TextEncoder().encode("<svg></svg>");
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
  assert.throws(() => validateImageType("text/html", html), hasCode("REMOTE_IMAGE_INVALID_TYPE"));
  assert.throws(() => validateImageType("image/svg+xml", svg), hasCode("REMOTE_IMAGE_INVALID_TYPE"));
  assert.throws(() => validateImageType("image/png", jpeg), hasCode("REMOTE_IMAGE_INVALID_TYPE"));
});

test("checks recipe ownership before starting its image download", () => {
  const source = readFileSync(new URL("../convex/remoteImages.ts", import.meta.url), "utf8");
  const proxy = source.slice(source.indexOf("export const proxyExternalImage"));
  const ownershipCheck = proxy.indexOf("ctx.runQuery(api.recipes.get");
  const download = proxy.indexOf("proxyRecipeImage(ctx, recipe.userId, recipe)");
  assert.ok(ownershipCheck >= 0 && download > ownershipCheck);
  assert.match(source, /ctx\.runQuery\(internal\.recipes\.getForUser/);
  assert.doesNotMatch(readFileSync(new URL("../convex/recipes.ts", import.meta.url), "utf8"), /fetch\(sourceImageUrl/);
});
