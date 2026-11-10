"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { runLegacyImport } from "./legacyImport";
import {
  canonicalizeInstagramUrl,
  extractInstagramShortCode,
  isSupportedInstagramUrl,
  needsInstagramRedirectResolution,
} from "./lib/socialUrls";
import { buildExtractionPrompt, buildRecoveryPrompt, type PromptOptions } from "./socialImportPrompts";
import { runSocialImport, type ApifyAttempt, type SocialPlatform } from "./socialImport";

const POST_ACTOR = "apify~instagram-scraper";
const REEL_ACTOR = "apify~instagram-reel-scraper";
// Apify-Läufe dauern real p50 8–24 s, p90 39–42 s, Ausreißer bis 77 s (Nov. 2026). Ein Abbruch
// verwirft bereits bezahlte Ergebnisse, daher lange Obergrenzen (gedeckelt durch
// SCRAPE_PHASE_BUDGET_MS) und nach HEDGE_AFTER_MS ein paralleler Zweitversuch mit dem anderen Actor.
const PRIMARY_TIMEOUT_MS = 90_000;
const FALLBACK_TIMEOUT_MS = 80_000;
const HEDGE_AFTER_MS = 15_000;
const REDIRECT_TIMEOUT_MS = 4_500;
const MIN_CAPTION_LENGTH = 12;

const normalizeInstagramUrl = async (rawUrl: string): Promise<string> => {
  const canonical = canonicalizeInstagramUrl(rawUrl);
  if (!needsInstagramRedirectResolution(canonical)) return canonical;

  try {
    const response = await fetch(canonical, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return response.url ? canonicalizeInstagramUrl(response.url) : canonical;
  } catch {
    // Best effort: die kanonische URL bleibt auch ohne Redirect brauchbar.
    return canonical;
  }
};

const PROMPT_OPTIONS: PromptOptions = {
  label: "Instagram",
  sourceDescription: "dieser Instagram-Caption",
};

const actorInput = (actor: string, url: string): Record<string, unknown> =>
  actor === REEL_ACTOR
    ? { username: [url], resultsLimit: 1 }
    : { directUrls: [url], resultsType: "posts", resultsLimit: 1 };

export const instagramPlatform: SocialPlatform = {
  id: "instagram",
  label: "Instagram",
  invalidUrlErrorCode: "INVALID_INSTAGRAM_URL",
  minCaptionLength: MIN_CAPTION_LENGTH,

  isSupportedUrl: isSupportedInstagramUrl,
  normalizeUrl: normalizeInstagramUrl,
  targetKeyFromUrl: extractInstagramShortCode,
  canonicalizeCandidateUrl: canonicalizeInstagramUrl,
  candidateKey: (post, canonicalUrl) =>
    (typeof post.shortCode === "string" && post.shortCode) ||
    (typeof post.postId === "string" && post.postId) ||
    extractInstagramShortCode(canonicalUrl),

  textPaths: [
    "caption",
    "text",
    "transcript",
    "message.text",
    "edge_media_to_caption.edges[0].node.text",
    "title",
  ],
  imagePaths: ["images[0]", "displayUrl", "displayResourceUrls[0]", "thumbnailUrl", "image.url"],
  urlPaths: ["url", "inputUrl", "permalink", "postUrl"],

  attempts: ({ url }): ApifyAttempt[] => {
    // Reel-URLs bedient der Reel-Actor zuverlässiger; der jeweils andere ist der Fallback.
    const isReel = url.includes("/reel/");
    const [primary, fallback] = isReel ? [REEL_ACTOR, POST_ACTOR] : [POST_ACTOR, REEL_ACTOR];
    return [
      {
        label: "primary",
        actor: primary,
        input: actorInput(primary, url),
        timeoutMs: PRIMARY_TIMEOUT_MS,
        hedgeAfterMs: HEDGE_AFTER_MS,
      },
      { label: "fallback", actor: fallback, input: actorInput(fallback, url), timeoutMs: FALLBACK_TIMEOUT_MS },
    ];
  },

  buildPrompt: (text) => buildExtractionPrompt(PROMPT_OPTIONS, text),
  buildRecoveryPrompt: (text) => buildRecoveryPrompt(PROMPT_OPTIONS, text),
};

export const scrapePost = action({
  args: { url: v.string() },
  handler: (ctx, args): Promise<Id<"recipes">> => runLegacyImport(ctx, "instagram", args.url),
});

export const scrapePostInternal = internalAction({
  args: { userId: v.id("users"), url: v.string() },
  handler: (ctx, args) => runSocialImport(ctx, instagramPlatform, args),
});
