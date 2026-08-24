"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { runLegacyImport } from "./legacyImport";
import {
  canonicalizeTiktokUrl,
  extractTiktokVideoId,
  isSupportedTiktokUrl,
  needsTiktokRedirectResolution,
  rankSubtitleLinks,
  vttToPlainText,
} from "./lib/tiktokContent";
import { buildExtractionPrompt, buildRecoveryPrompt, type PromptOptions } from "./socialImportPrompts";
import { runSocialImport, type ApifyAttempt, type SocialPlatform } from "./socialImport";
import { getNestedValue } from "./socialImportShared";

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

const ACTOR = "clockworks~tiktok-scraper";
/** Gemessen 2026-08-24: 16–25 s pro Einzelvideo. Instagrams 15 s wären hier fast immer ein Timeout. */
const PRIMARY_TIMEOUT_MS = 45_000;
const TRANSCRIPTION_TIMEOUT_MS = 45_000;
const REDIRECT_TIMEOUT_MS = 5_000;
const SUBTITLE_FETCH_TIMEOUT_MS = 6_000;
const MIN_CAPTION_LENGTH = 12;
/** Unterhalb dieser Zeichenzahl reicht der Text erfahrungsgemäß nicht für ein Rezept. */
const THIN_TEXT_THRESHOLD = 220;

/**
 * Speech-to-Text kostet ~$0.048 je angefangener Minute — rund das Zehnfache eines
 * normalen Imports (~$0.005). Deshalb nur als zweiter Versuch, wenn Beschreibung und
 * vorhandene Untertitel zu dünn sind, und per Convex-Env-Variable abschaltbar.
 */
const transcriptionFallbackEnabled = (): boolean =>
  (process.env.TIKTOK_TRANSCRIBE_FALLBACK ?? "true").toLowerCase() !== "false";

const normalizeTiktokUrl = async (rawUrl: string): Promise<string> => {
  const canonical = canonicalizeTiktokUrl(rawUrl);
  if (!needsTiktokRedirectResolution(canonical)) return canonical;

  try {
    const response = await fetch(canonical, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return response.url ? canonicalizeTiktokUrl(response.url) : canonical;
  } catch {
    // Best effort — der Actor kommt oft auch mit dem Kurzlink zurecht.
    return canonical;
  }
};

const fetchSubtitleText = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      headers: APIFY_TOKEN ? { Authorization: `Bearer ${APIFY_TOKEN}` } : {},
      signal: AbortSignal.timeout(SUBTITLE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return "";
    return vttToPlainText(await response.text());
  } catch {
    return "";
  }
};

const PROMPT_OPTIONS: PromptOptions = {
  label: "TikTok",
  sourceDescription: "dieser TikTok-Beschreibung und dem Transkript des Videos",
  notes: [
    'Das Transkript stammt aus automatischer Spracherkennung und kann Hörfehler enthalten (z. B. "kaneloni" statt "Cannelloni"). Korrigiere offensichtliche Fehler stillschweigend.',
    "Beschreibung und Transkript beschreiben dasselbe Gericht — führe beide zu EINEM Rezept zusammen, statt Schritte zu wiederholen.",
  ],
};

const actorInput = (url: string, transcribe: boolean): Record<string, unknown> => ({
  postURLs: [url],
  resultsPerPage: 1,
  downloadSubtitlesOptions: transcribe
    ? "DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES"
    : "DOWNLOAD_SUBTITLES",
  shouldDownloadVideos: false,
  shouldDownloadCovers: false,
  shouldDownloadAvatars: false,
  shouldDownloadMusicCovers: false,
  shouldDownloadSlideshowImages: false,
  scrapeRelatedVideos: false,
  scrapeAdditionalAuthorMeta: false,
  commentsPerPost: 0,
  topLevelCommentsPerPost: 0,
  // "None" vermeidet den Residential-Proxy-Aufschlag pro Video.
  proxyCountryCode: "None",
});

export const tiktokPlatform: SocialPlatform = {
  id: "tiktok",
  label: "TikTok",
  invalidUrlErrorCode: "INVALID_TIKTOK_URL",
  minCaptionLength: MIN_CAPTION_LENGTH,

  isSupportedUrl: isSupportedTiktokUrl,
  normalizeUrl: normalizeTiktokUrl,
  targetKeyFromUrl: extractTiktokVideoId,
  canonicalizeCandidateUrl: canonicalizeTiktokUrl,
  candidateKey: (post, canonicalUrl) =>
    (typeof post.id === "string" && post.id) || extractTiktokVideoId(canonicalUrl),

  textPaths: ["text", "videoMeta.aiVideoDescription", "videoMeta.aiVideoSummary"],
  imagePaths: [
    "videoMeta.coverUrl",
    "videoMeta.originalCoverUrl",
    "slideshowImageLinks[0].downloadLink",
  ],
  urlPaths: ["webVideoUrl", "submittedVideoUrl"],

  attempts: ({ url }): ApifyAttempt[] => {
    const attempts: ApifyAttempt[] = [
      { label: "primary", actor: ACTOR, input: actorInput(url, false), timeoutMs: PRIMARY_TIMEOUT_MS },
    ];
    if (transcriptionFallbackEnabled()) {
      attempts.push({
        label: "transcription",
        actor: ACTOR,
        input: actorInput(url, true),
        timeoutMs: TRANSCRIPTION_TIMEOUT_MS,
      });
    }
    return attempts;
  },

  shouldRetry: (best) => {
    if (!best) return true;
    return [best.caption, ...best.extraTexts].join(" ").trim().length < THIN_TEXT_THRESHOLD;
  },

  collectExtraTexts: async (post) => {
    const links = rankSubtitleLinks(getNestedValue(post, "videoMeta.subtitleLinks"));
    const texts = await Promise.all(links.map(({ url }) => fetchSubtitleText(url)));
    return texts.filter(Boolean);
  },

  buildPrompt: (text) => buildExtractionPrompt(PROMPT_OPTIONS, text),
  buildRecoveryPrompt: (text) => buildRecoveryPrompt(PROMPT_OPTIONS, text),
};

export const scrapePost = action({
  args: { url: v.string() },
  handler: (ctx, args): Promise<Id<"recipes">> => runLegacyImport(ctx, "tiktok", args.url),
});

export const scrapePostInternal = internalAction({
  args: { userId: v.id("users"), url: v.string() },
  handler: (ctx, args) => runSocialImport(ctx, tiktokPlatform, args),
});
