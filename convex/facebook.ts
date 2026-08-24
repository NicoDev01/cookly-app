"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { runLegacyImport } from "./legacyImport";
import {
  canonicalizeFacebookUrl,
  extractFacebookPostId,
  isLikelyFacebookReelUrl,
  isSupportedFacebookUrl,
  needsFacebookRedirectResolution,
} from "./lib/socialUrls";
import { buildExtractionPrompt, buildRecoveryPrompt, type PromptOptions } from "./socialImportPrompts";
import { runSocialImport, type ApifyAttempt, type SocialPlatform } from "./socialImport";

const POSTS_ACTOR = "apify~facebook-posts-scraper";
const REELS_ACTOR = "apify~facebook-reels-scraper";
const PRIMARY_TIMEOUT_MS = 15_000;
const FALLBACK_TIMEOUT_MS = 6_000;
const REDIRECT_TIMEOUT_MS = 2_500;
const MIN_CAPTION_LENGTH = 40;
const MAX_GEMINI_INPUT_CHARS = 10_000;

const normalizeFacebookUrl = async (rawUrl: string): Promise<string> => {
  const canonical = canonicalizeFacebookUrl(rawUrl);
  if (!needsFacebookRedirectResolution(canonical)) return canonical;

  try {
    const response = await fetch(canonical, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return response.url ? canonicalizeFacebookUrl(response.url) : canonical;
  } catch {
    // Best effort: die kanonische URL bleibt auch ohne Redirect brauchbar.
    return canonical;
  }
};

const PROMPT_OPTIONS: PromptOptions = {
  label: "Facebook",
  sourceDescription: "diesem Facebook-Beitrag",
};

const actorInput = (url: string): Record<string, unknown> => ({
  startUrls: [{ url }],
  resultsLimit: 1,
});

export const facebookPlatform: SocialPlatform = {
  id: "facebook",
  label: "Facebook",
  invalidUrlErrorCode: "INVALID_FACEBOOK_URL",
  minCaptionLength: MIN_CAPTION_LENGTH,
  maxTextParts: 8,
  maxGeminiInputChars: MAX_GEMINI_INPUT_CHARS,

  isSupportedUrl: isSupportedFacebookUrl,
  normalizeUrl: normalizeFacebookUrl,
  targetKeyFromUrl: extractFacebookPostId,
  canonicalizeCandidateUrl: canonicalizeFacebookUrl,
  candidateKey: (post, canonicalUrl) =>
    (typeof post.postId === "string" && post.postId) || extractFacebookPostId(canonicalUrl),

  textPaths: [
    "message.text", "text", "message", "caption", "story", "description",
    "post.text", "post.message.text", "post.message", "post.caption",
    "translated_message_for_viewer.text", "title", "captionText",
    "media[0].ocrText", "media[0].description",
    "media[1].ocrText", "media[1].description",
    "media[2].ocrText", "media[2].description",
  ],
  imagePaths: [
    "media[0].photo_image.uri", "media[0].image.uri", "media[0].thumbnail", "media[0].photo_image.url",
    "media[1].photo_image.uri", "media[1].image.uri",
    "playback_video.preferred_thumbnail.image.uri",
    "playback_video.image.uri",
    "playback_video.thumbnailImage.uri",
    "short_form_video_context.playback_video.thumbnailImage.uri",
    "short_form_video_context.playback_video.preferred_thumbnail.image.uri",
    "short_form_video_context.video.first_frame_thumbnail",
    "if_should_change_url_for_reels.thumbnail",
    "image.uri",
    "thumbnail",
  ],
  urlPaths: [
    "url", "topLevelReelUrl", "shareable_url", "shareableUrl", "topLevelUrl",
    "postUrl", "inputUrl", "facebookUrl",
    "playback_video.permalink_url",
    "if_should_change_url_for_reels.shareable_url",
  ],

  attempts: ({ url }): ApifyAttempt[] => [
    // Der Posts-Actor bedient auch Reel-URLs zuverlässig und ist in der Praxis schneller.
    { label: "primary", actor: POSTS_ACTOR, input: actorInput(url), timeoutMs: PRIMARY_TIMEOUT_MS },
    { label: "reels_fallback", actor: REELS_ACTOR, input: actorInput(url), timeoutMs: FALLBACK_TIMEOUT_MS },
  ],

  shouldRetry: (best, { url }) => (!best || !best.caption.trim()) && isLikelyFacebookReelUrl(url),

  buildPrompt: (text) => buildExtractionPrompt(PROMPT_OPTIONS, text),
  buildRecoveryPrompt: (text) => buildRecoveryPrompt(PROMPT_OPTIONS, text),
};

export const scrapePost = action({
  args: { url: v.string() },
  handler: (ctx, args): Promise<Id<"recipes">> => runLegacyImport(ctx, "facebook", args.url),
});

export const scrapePostInternal = internalAction({
  args: { userId: v.id("users"), url: v.string() },
  handler: (ctx, args) => runSocialImport(ctx, facebookPlatform, args),
});
