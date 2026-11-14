"use node";

import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { IncomingMessage } from "node:http";
import { checkServerIdentity } from "node:tls";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { createImportTimer } from "./importTiming";
import {
  buildRecipeImageUrl,
  getConsistentSeed,
  stripPollinationsApiKeyFromUrl,
} from "./pollinationsHelper";
import {
  MAX_REMOTE_IMAGE_BYTES,
  RemoteImageError,
  assertContentLength,
  assertPublicAddresses,
  hostMatchesSuffix,
  readLimitedBody,
  remoteImageErrorCode,
  validateImageType,
  validateRedirect,
  validateRemoteUrl,
  type RemoteImageProvider,
} from "./lib/remoteImagePolicy";

const USER_AGENT = "Cookly/1.0 remote-image-proxy";
const IMAGE_HEADERS = { "User-Agent": USER_AGENT, Accept: "image/avif,image/webp,image/png,image/jpeg" };
// Rezeptseiten liefern Bots oft eine Sperrseite; mit einem normalen Mobil-Browser-Kennzeichen kommt die echte Seite.
const PAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
};
const MAX_PAGE_BYTES = 4 * 1024 * 1024;

type RemoteImage = {
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
};

const timeoutError = () => new RemoteImageError("REMOTE_IMAGE_TIMEOUT");

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) throw timeoutError();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timeoutError()), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

async function resolvePublicAddress(url: URL, timeoutMs: number) {
  let addresses;
  try {
    addresses = await withTimeout(lookup(url.hostname, { all: true, verbatim: true }), timeoutMs);
  } catch (error) {
    if (error instanceof RemoteImageError) throw error;
    throw new RemoteImageError("REMOTE_IMAGE_DNS_ERROR");
  }
  assertPublicAddresses(addresses.map(({ address }) => address));
  return addresses.find(({ family }) => family === 4) ?? addresses[0];
}

function openResponse(
  url: URL,
  address: Awaited<ReturnType<typeof resolvePublicAddress>>,
  timeoutMs: number,
  headers: Record<string, string>,
) {
  return new Promise<{ response: IncomingMessage; cancel: () => void }>((resolve, reject) => {
    let response: IncomingMessage | undefined;
    const req = request({
      protocol: "https:",
      hostname: address.address,
      family: address.family,
      servername: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { Host: url.host, ...headers },
      checkServerIdentity: (_host, certificate) => checkServerIdentity(url.hostname, certificate),
    }, (incoming) => {
      response = incoming;
      incoming.setTimeout(Math.min(timeoutMs, 5_000), () => incoming.destroy(timeoutError()));
      resolve({ response: incoming, cancel });
    });
    const timer = setTimeout(() => (response ?? req).destroy(timeoutError()), timeoutMs);
    const cancel = () => {
      clearTimeout(timer);
    };
    req.once("error", (error) => {
      cancel();
      reject(error);
    });
    req.end();
  });
}

/** Holt eine öffentliche https-URL mit DNS-Prüfung, Redirect- und Größenlimit (Schutz vor SSRF). */
async function fetchValidatedRemote({
  url,
  provider,
  maxBytes,
  timeoutMs,
  headers,
}: {
  url: string;
  provider: RemoteImageProvider;
  maxBytes: number;
  timeoutMs: number;
  headers: Record<string, string>;
}): Promise<{ bytes: Uint8Array; contentType: string | undefined; finalUrl: string }> {
  const deadline = Date.now() + timeoutMs;
  const visited = new Set<string>();
  let current = validateRemoteUrl(url, provider);
  let redirects = 0;

  while (true) {
    if (visited.has(current.href)) throw new RemoteImageError("REMOTE_IMAGE_REDIRECT");
    visited.add(current.href);

    const remaining = deadline - Date.now();
    const address = await resolvePublicAddress(current, remaining);
    let opened;
    try {
      opened = await openResponse(current, address, deadline - Date.now(), headers);
    } catch (error) {
      if (error instanceof RemoteImageError) throw error;
      throw new RemoteImageError("REMOTE_IMAGE_FETCH_FAILED");
    }

    const { response, cancel } = opened;
    try {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.destroy();
        current = validateRedirect(current, response.headers.location, provider, redirects++);
        continue;
      }
      if (status < 200 || status >= 300) throw new RemoteImageError("REMOTE_IMAGE_HTTP_ERROR");

      assertContentLength(response.headers["content-length"], maxBytes);
      const bytes = await readLimitedBody(response, maxBytes);
      return { bytes, contentType: response.headers["content-type"], finalUrl: current.href };
    } catch (error) {
      if (error instanceof RemoteImageError) throw error;
      throw new RemoteImageError("REMOTE_IMAGE_FETCH_FAILED");
    } finally {
      cancel();
    }
  }
}

async function fetchValidatedRemoteImage({
  url,
  provider,
  maxBytes = MAX_REMOTE_IMAGE_BYTES,
  timeoutMs,
}: {
  url: string;
  provider: RemoteImageProvider;
  maxBytes?: number;
  timeoutMs: number;
}): Promise<RemoteImage> {
  const fetched = await fetchValidatedRemote({ url, provider, maxBytes, timeoutMs, headers: IMAGE_HEADERS });
  return { bytes: fetched.bytes, contentType: validateImageType(fetched.contentType, fetched.bytes), finalUrl: fetched.finalUrl };
}

/** HTML einer Rezeptseite direkt laden (ohne Jina). Wirft RemoteImageError bei Sperre, Fehler oder Timeout. */
export async function fetchRemotePage(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string }> {
  const target = new URL(url);
  target.hash = "";
  const fetched = await fetchValidatedRemote({
    url: target.href,
    provider: "website",
    maxBytes: MAX_PAGE_BYTES,
    timeoutMs,
    headers: PAGE_HEADERS,
  });
  if (fetched.contentType && !/html/i.test(fetched.contentType)) throw new RemoteImageError("REMOTE_IMAGE_HTTP_ERROR");
  return { html: new TextDecoder("utf-8").decode(fetched.bytes), finalUrl: fetched.finalUrl };
}

function getHostname(value?: string): string {
  try {
    return value ? new URL(value).hostname : "";
  } catch {
    return "";
  }
}

function getProvider(sourceUrl: string | undefined, imageUrl: string): RemoteImageProvider {
  const imageHost = getHostname(imageUrl);
  const sourceHost = getHostname(sourceUrl);
  if (hostMatchesSuffix(imageHost, "pollinations.ai")) return "pollinations";
  if (hostMatchesSuffix(sourceHost, "instagram.com")) return "instagram";
  if (hostMatchesSuffix(sourceHost, "facebook.com") || hostMatchesSuffix(sourceHost, "fb.watch")) return "facebook";
  if (hostMatchesSuffix(sourceHost, "tiktok.com")) return "tiktok";
  return "website";
}

function toBlob(image: RemoteImage): Blob {
  const buffer = image.bytes.buffer.slice(
    image.bytes.byteOffset,
    image.bytes.byteOffset + image.bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([buffer], { type: image.contentType });
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) return { type: typeof error };
  return {
    name: error.name,
    message: error.message,
    code: (error as NodeJS.ErrnoException).code,
  };
}

export const generateAndStoreAiImage = action({
  args: { recipeTitle: v.string() },
  handler: async (ctx, args): Promise<{ url: string; storageId: Id<"_storage"> }> => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");
    const rate = await ctx.runMutation(internal.rateLimiter.checkAndConsumeRateLimit, { userId: authUserId, bucket: "ai_image" });
    if (!rate.allowed) throw new Error("RATE_LIMIT_EXCEEDED");
    if (!await ctx.runMutation(internal.rateLimiter.checkAndConsumeProviderBudget, { provider: "pollinations" })) {
      throw new Error("PROVIDER_BUDGET_EXHAUSTED");
    }
    const image = await fetchValidatedRemoteImage({
      url: buildRecipeImageUrl(args.recipeTitle, getConsistentSeed(args.recipeTitle)),
      provider: "pollinations",
      timeoutMs: 20_000,
    });
    const storageId = await ctx.storage.store(toBlob(image));
    await ctx.runMutation(internal.storageAssets.registerServerAsset, {
      storageId,
      authUserId: authUserId.toString(),
      purpose: "ai_generated",
    });
    const storageUrl = await ctx.storage.getUrl(storageId);
    if (!storageUrl) throw new Error("Stored AI image URL could not be loaded.");
    return { url: storageUrl, storageId };
  },
});

type ProxyResult = {
  success: boolean;
  imageStorageId?: Id<"_storage">;
  imageUrl?: string;
  errorCode?: string;
};

type ProxyRecipe = Pick<
  Doc<"recipes">,
  "_id" | "title" | "sourceUrl" | "sourceImageUrl" | "imageStorageId"
>;

async function proxyRecipeImage(
  ctx: ActionCtx,
  userId: Id<"users">,
  recipe: ProxyRecipe,
  /** Bild aus dem Import-Cache: als eigene Kopie für den Nutzer speichern statt neu laden. */
  cachedImageStorageId?: Id<"_storage">,
): Promise<ProxyResult> {
  const timer = createImportTimer("image_proxy", { recipeId: recipe._id });
  timer.mark("recipe_loaded");
  if (recipe.imageStorageId) return { success: true, imageStorageId: recipe.imageStorageId };

  const fallback = !recipe.sourceImageUrl;
  if (fallback && !await ctx.runMutation(internal.rateLimiter.checkAndConsumeProviderBudget, { provider: "pollinations" })) {
    throw new Error("PROVIDER_BUDGET_EXHAUSTED");
  }
  const rawUrl = recipe.sourceImageUrl ?? buildRecipeImageUrl(
    recipe.title || "Delicious Food",
    getConsistentSeed(recipe.title || "Delicious Food"),
  );
  const sourceImageUrl = stripPollinationsApiKeyFromUrl(rawUrl) ?? rawUrl;
  if (fallback) timer.mark("fallback_image_generated");

  let storageId: Id<"_storage"> | undefined;
  let registered = false;
  try {
    const cached = cachedImageStorageId ? await ctx.storage.get(cachedImageStorageId).catch(() => null) : null;
    if (cached) {
      // Eigene Kopie: Läuft der Cache-Eintrag ab, bleibt das Bild des Nutzers erhalten.
      storageId = await ctx.storage.store(cached);
      timer.mark("copied_from_import_cache");
    } else {
      const image = await fetchValidatedRemoteImage({
        url: sourceImageUrl,
        provider: getProvider(recipe.sourceUrl, sourceImageUrl),
        timeoutMs: 12_000,
      });
      timer.mark("source_fetched");
      storageId = await ctx.storage.store(toBlob(image));
    }
    timer.mark("stored_in_convex");
    await ctx.runMutation(internal.storageAssets.registerServerAssetForUser, {
      storageId,
      userId,
      purpose: "imported_image",
    });
    registered = true;
    const imageUrl = await ctx.storage.getUrl(storageId);
    if (!imageUrl) throw new Error("STORED_IMAGE_URL_MISSING");

    const attached = await ctx.runMutation(internal.recipes.attachProxiedImage, {
      userId,
      recipeId: recipe._id,
      storageId,
      imageUrl,
      sourceImageUrl,
    });
    if (!attached) {
      await ctx.runMutation(internal.storageAssets.discardServerAssetForUser, { storageId, userId });
      timer.summary({ result: "already_proxied" });
      return { success: true };
    }

    timer.summary({ result: "proxied" });
    return { success: true, imageStorageId: storageId, imageUrl };
  } catch (error) {
    if (storageId) {
      if (registered) {
        await ctx.runMutation(internal.storageAssets.discardServerAssetForUser, {
          storageId,
          userId,
        }).catch(() => undefined);
      } else {
        await ctx.storage.delete(storageId).catch(() => undefined);
      }
    }
    const errorCode = remoteImageErrorCode(error);
    console.warn("[proxyExternalImage] Failed", { errorCode, error: errorDetails(error) });
    timer.summary({ result: "failed", errorCode });
    return { success: false, errorCode };
  }
}

export const proxyExternalImage = action({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args): Promise<ProxyResult> => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");

    const recipe = await ctx.runQuery(api.recipes.get, { id: args.recipeId });
    if (!recipe) throw new Error("Recipe not found or access denied");
    if (!recipe.userId) throw new Error("Recipe owner missing");
    return await proxyRecipeImage(ctx, recipe.userId, recipe);
  },
});

export const proxyImportedImage = internalAction({
  args: { userId: v.id("users"), recipeId: v.id("recipes"), cachedImageStorageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args): Promise<ProxyResult> => {
    const recipe = await ctx.runQuery(internal.recipes.getForUser, {
      userId: args.userId,
      id: args.recipeId,
    });
    if (!recipe) throw new Error("Recipe not found or access denied");
    return await proxyRecipeImage(ctx, args.userId, recipe, args.cachedImageStorageId);
  },
});

/** Bild eines neuen Import-Cache-Eintrags in Cache-eigenen Storage laden (siehe importCache.ts). */
export const storeImportCacheImage = internalAction({
  args: { key: v.string(), createdAt: v.number(), sourceUrl: v.optional(v.string()), imageUrl: v.string() },
  handler: async (ctx, args) => {
    try {
      const image = await fetchValidatedRemoteImage({
        url: args.imageUrl,
        provider: getProvider(args.sourceUrl, args.imageUrl),
        timeoutMs: 12_000,
      });
      const storageId = await ctx.storage.store(toBlob(image));
      await ctx.runMutation(internal.importCache.attachImage, { key: args.key, createdAt: args.createdAt, storageId });
    } catch (error) {
      // Ohne Bild bleibt der Eintrag nutzbar; Treffer laden dann vom Original-Link.
      console.warn("[importCache] image not stored", { errorCode: remoteImageErrorCode(error) });
    }
  },
});

export const proxyExternalImages = action({
  args: { recipeIds: v.array(v.id("recipes")) },
  handler: async (ctx, args): Promise<{ proxied: number; failed: number }> => {
    if (!await getAuthUserId(ctx)) throw new Error("Not authenticated");
    let proxied = 0;
    let failed = 0;
    for (const recipeId of args.recipeIds) {
      try {
        const result: ProxyResult = await ctx.runAction(api.remoteImages.proxyExternalImage, { recipeId });
        if (result.success) proxied++;
        else failed++;
      } catch {
        failed++;
      }
    }
    return { proxied, failed };
  },
});
