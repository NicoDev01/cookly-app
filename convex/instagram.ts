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
import { parseInstagramEmbedPage, type InstagramEmbedData } from "./lib/instagramContent";
import { buildExtractionPrompt, buildRecoveryPrompt, type PromptOptions } from "./socialImportPrompts";
import { runSocialImport, type ApifyAttempt, type SocialPlatform } from "./socialImport";
import type { ScrapedCandidate } from "./socialImportShared";

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

/**
 * Schneller Weg über die öffentliche Einbettungsseite (gemessen 2026-11-17 aus Convex: 18 von 18 Beiträgen,
 * 0,2–0,4 s statt 8–24 s mit Apify). Liefert Caption und Vorschaubild, also denselben Text wie Apify.
 * Per Convex-Env-Variable abschaltbar; bei Fehlern, privaten Beiträgen oder zu kurzer Caption läuft Apify wie bisher.
 */
const embedFastPathEnabled = (): boolean =>
  (process.env.INSTAGRAM_EMBED_FAST_PATH ?? "true").toLowerCase() !== "false";
const EMBED_TIMEOUT_MS = 3_000;
/** Kürzere Captions verweisen meist nur auf Video oder Bio; dann kann Apify (Reel-Transkript) mehr liefern. */
const EMBED_MIN_CAPTION_LENGTH = 150;
const EMBED_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** Einbettungsseite abrufen und auslesen (auch vom Kontroll-Check in importCanary.ts genutzt). */
export const fetchInstagramEmbed = async (shortcode: string): Promise<InstagramEmbedData | null> => {
  if (!/^[A-Za-z0-9_-]{5,64}$/.test(shortcode)) return null;
  // Fester Host, Shortcode aus der bereits normalisierten URL.
  const response = await fetch(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
    redirect: "follow",
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    headers: { "User-Agent": EMBED_USER_AGENT, "Accept-Language": "de-DE,de;q=0.9,en;q=0.5" },
  });
  if (!response.ok) return null;
  return parseInstagramEmbedPage(await response.text(), shortcode);
};

const fastCandidateFromEmbed = async ({ url, targetKey }: { url: string; targetKey: string }): Promise<ScrapedCandidate | null> => {
  if (!embedFastPathEnabled()) return null;
  const embed = await fetchInstagramEmbed(targetKey);
  if (!embed) return null;
  return {
    post: { shortCode: embed.shortcode, caption: embed.caption },
    caption: embed.caption,
    extraTexts: [],
    imageUrl: embed.imageUrl ?? "",
    canonicalUrl: url,
    key: embed.shortcode,
    score: 0,
  };
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

  fastCandidate: fastCandidateFromEmbed,
  fastMinTextLength: EMBED_MIN_CAPTION_LENGTH,

  buildPrompt: (text) => buildExtractionPrompt(PROMPT_OPTIONS, text),
  buildRecoveryPrompt: (text) => buildRecoveryPrompt(PROMPT_OPTIONS, text),
};

export const scrapePost = action({
  args: { url: v.string() },
  handler: (ctx, args): Promise<Id<"recipes">> => runLegacyImport(ctx, "instagram", args.url),
});

export const scrapePostInternal = internalAction({
  args: { userId: v.id("users"), url: v.string(), operationId: v.optional(v.string()) },
  handler: (ctx, args) => runSocialImport(ctx, instagramPlatform, args),
});
