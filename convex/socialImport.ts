import { GoogleGenAI } from "@google/genai";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { GEMINI_MODELS } from "./constants";
import { createImportTimer } from "./importTiming";
import {
  RECIPE_RESPONSE_JSON_SCHEMA,
  buildGeminiInput,
  deriveTitleFromCaption,
  extractApifyErrorCode,
  extractFirstHttpUrl,
  extractTextCandidates,
  isExistingRecipeUsable,
  isGenericRecipeTitle,
  normalizeRecipeData,
  pickLongestText,
  scoreCandidate,
  hasBudgetForAttempt,
  selectBestCandidate,
  toRecord,
  type RecipeData,
  type ScrapedCandidate,
} from "./socialImportShared";

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

/**
 * Apify meldet fachliche Probleme (privat, gelöscht, gesperrt) nicht als HTTP-Fehler,
 * sondern als Dataset-Item mit `errorCode`. Diese hier sind für den Nutzer erklärbar.
 */
/**
 * Obergrenze für die gesamte Scraping-Phase (alle Actor-Versuche zusammen). Danach bleiben
 * innerhalb des 120-s-Client-Budgets noch ~35 s für Untertitel, Gemini und die Convex-Writes.
 */
const SCRAPE_PHASE_BUDGET_MS = 85_000;

const UNAVAILABLE_POST_ERROR_CODES = new Set([
  "POST_NOT_FOUND_OR_PRIVATE",
  "POST_SENSITIVE",
  "PROFILE_PRIVATE",
  "NOT_FOUND",
]);

export type ApifyAttempt = {
  /** Timer-Label, z. B. "primary" oder "transcription". */
  label: string;
  actor: string;
  input: Record<string, unknown>;
  timeoutMs: number;
};

export type SocialPlatform = {
  id: "instagram" | "facebook" | "tiktok";
  /** Anzeigename für Fehlertexte. */
  label: string;
  invalidUrlErrorCode: string;
  minCaptionLength: number;

  isSupportedUrl(rawUrl: string): boolean;
  normalizeUrl(rawUrl: string): Promise<string>;
  /** Stabiler Schlüssel des Ziel-Posts (Shortcode, Video-ID …) für das Kandidaten-Matching. */
  targetKeyFromUrl(url: string): string;
  canonicalizeCandidateUrl(rawUrl: string): string;
  candidateKey(post: Record<string, unknown>, canonicalUrl: string): string;

  textPaths: readonly string[];
  imagePaths: readonly string[];
  urlPaths: readonly string[];
  /** Begrenzt den an Gemini gesendeten Text (Facebook-Posts können sehr lang werden). */
  maxTextParts?: number;
  maxGeminiInputChars?: number;

  /** Versuche in Reihenfolge; der nächste läuft nur, wenn `shouldRetry` true liefert. */
  attempts(context: { url: string; targetKey: string }): ApifyAttempt[];
  shouldRetry?(best: ScrapedCandidate | null, context: { url: string; targetKey: string }): boolean;

  /** Zusätzlicher Text zum Post, z. B. TikTok-Untertitel. Nur für den besten Kandidaten. */
  collectExtraTexts?(post: Record<string, unknown>): Promise<string[]>;

  buildPrompt(text: string): string;
  buildRecoveryPrompt(text: string): string;
};

export type SocialImportResult =
  | { recipeId: Id<"recipes"> }
  | { staleRecipeId?: Id<"recipes">; payload: Record<string, unknown> };

const toStructuredError = (payload: Record<string, unknown>): Error => new Error(JSON.stringify(payload));

const noRecipeContentError = (message: string) =>
  toStructuredError({ type: "NO_RECIPE_CONTENT", message });

const postUnavailableError = (label: string, errorCode: string) =>
  toStructuredError({
    type: "POST_UNAVAILABLE",
    service: label.toLowerCase(),
    providerErrorCode: errorCode,
    message: `Dieser ${label}-Beitrag ist privat, gesperrt oder wurde gelöscht.`,
  });

const serviceUnavailableError = (label: string, prefillUrl: string) =>
  toStructuredError({
    type: "API_UNAVAILABLE",
    service: "apify",
    fallbackMode: "manual",
    prefillUrl,
    message: `Der ${label}-Service ist gerade nicht verfügbar. Bitte versuche es gleich erneut.`,
  });

export async function runApifyActor(
  actor: string,
  input: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown[]> {
  const response = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${APIFY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Apify ${actor} failed: ${response.status} ${response.statusText}`);
  }

  const items = await response.json();
  if (!Array.isArray(items)) {
    throw new Error(`Apify ${actor} returned non-array dataset items`);
  }

  return items;
}

function pickBestCandidate(
  platform: SocialPlatform,
  items: unknown[],
  targetCanonicalUrl: string,
  targetKey: string,
): ScrapedCandidate | null {
  let best: ScrapedCandidate | null = null;

  for (const item of items) {
    const post = toRecord(item);
    if (!post || typeof post.errorCode === "string") continue;

    const caption = pickLongestText(extractTextCandidates(post, platform.textPaths));
    const imageUrl = extractFirstHttpUrl(post, platform.imagePaths);
    const primaryUrl = extractFirstHttpUrl(post, platform.urlPaths);
    const canonicalUrl = primaryUrl ? platform.canonicalizeCandidateUrl(primaryUrl) : "";

    const candidate: ScrapedCandidate = {
      post,
      caption,
      extraTexts: [],
      imageUrl,
      canonicalUrl,
      key: platform.candidateKey(post, canonicalUrl),
      score: 0,
    };

    candidate.score = scoreCandidate({
      targetCanonicalUrl,
      targetKey,
      candidateCanonicalUrl: canonicalUrl,
      candidateKey: candidate.key,
      caption,
      imageUrl,
      minCaptionLength: platform.minCaptionLength,
    });

    if (!best || candidate.score > best.score) best = candidate;
  }

  return best;
}

async function extractRecipeWithGemini(
  platform: SocialPlatform,
  geminiInputText: string,
  caption: string,
  targetKey: string,
  timer: ReturnType<typeof createImportTimer>,
): Promise<RecipeData> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  const generate = (prompt: string) =>
    ai.models.generateContent({
      model: GEMINI_MODELS.recipeTextExtraction,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: RECIPE_RESPONSE_JSON_SCHEMA,
        temperature: 0,
      },
    });

  const parse = (responseText: string, stage: string): RecipeData => {
    if (!responseText) throw new Error(`Gemini ${stage} returned empty response`);
    return normalizeRecipeData(JSON.parse(responseText));
  };

  const withFallbackTitle = (recipe: RecipeData): RecipeData => {
    if (recipe.title && !isGenericRecipeTitle(recipe.title)) return recipe;
    const derived = deriveTitleFromCaption(caption);
    return { ...recipe, title: derived || `Rezept ${targetKey || platform.label}` };
  };

  let recipe = withFallbackTitle(parse((await generate(platform.buildPrompt(geminiInputText))).text || "", "extraction"));

  if (recipe.ingredients.length === 0 || recipe.instructions.length === 0) {
    timer.mark("content_validation_failed", {
      reason: "gemini_missing_recipe_sections",
      ingredients: recipe.ingredients.length,
      instructions: recipe.instructions.length,
    });

    const recovered = parse((await generate(platform.buildRecoveryPrompt(geminiInputText))).text || "", "recovery");
    if (recovered.ingredients.length === 0 || recovered.instructions.length === 0) {
      throw new Error("Gemini recovery returned recipe without ingredients or instructions");
    }
    recipe = withFallbackTitle(recovered);
  }

  return recipe;
}

/**
 * Gemeinsame Import-Pipeline für alle Social-Plattformen:
 * URL normalisieren → Dedupe → Apify (mit optionalen Folgeversuchen) → Gemini → Payload.
 */
export async function runSocialImport(
  ctx: ActionCtx,
  platform: SocialPlatform,
  args: { userId: Id<"users">; url: string },
): Promise<SocialImportResult> {
  const timer = createImportTimer(platform.id, { url: args.url });

  if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN is missing in Convex Environment Variables");
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is missing in Convex Environment Variables");
  timer.mark("env_checked");

  if (!platform.isSupportedUrl(args.url)) {
    throw new Error(platform.invalidUrlErrorCode);
  }

  const normalizedUrl = await platform.normalizeUrl(args.url);
  const targetKey = platform.targetKeyFromUrl(normalizedUrl);
  timer.mark("url_normalized", { normalizedUrl, targetKey });

  let staleExistingId: Id<"recipes"> | null = null;
  const existingRecipe = await ctx.runQuery(internal.recipes.getBySourceUrlForUser, {
    userId: args.userId,
    url: normalizedUrl,
  });
  if (existingRecipe?._id) {
    if (isExistingRecipeUsable(existingRecipe)) {
      timer.mark("dedupe_hit");
      timer.summary({ result: "existing_recipe" });
      return { recipeId: existingRecipe._id };
    }
    staleExistingId = existingRecipe._id;
    timer.mark("dedupe_stale_hit", { existingId: existingRecipe._id });
  }
  timer.mark("dedupe_miss");

  // --- Apify: Versuche nacheinander, bis das Ergebnis ausreicht ------------
  const context = { url: normalizedUrl, targetKey };
  const attempts = platform.attempts(context);
  const candidates: ScrapedCandidate[] = [];
  let lastError: unknown = null;
  let unavailableCode: string | null = null;

  const scrapeStartedAt = Date.now();

  for (const [index, attempt] of attempts.entries()) {
    const best = candidates.length > 0 ? candidates[candidates.length - 1] : null;
    if (index > 0) {
      if (!(platform.shouldRetry ?? ((candidate) => !candidate))(best, context)) break;

      const elapsedMs = Date.now() - scrapeStartedAt;
      if (!hasBudgetForAttempt(elapsedMs, attempt.timeoutMs, SCRAPE_PHASE_BUDGET_MS)) {
        timer.mark("apify_attempt_skipped_no_budget", { attempt: attempt.label, elapsedMs });
        break;
      }
    }

    try {
      const items = await runApifyActor(attempt.actor, attempt.input, attempt.timeoutMs);
      const errorCode = extractApifyErrorCode(items);
      if (errorCode && UNAVAILABLE_POST_ERROR_CODES.has(errorCode)) {
        unavailableCode = errorCode;
      }

      const candidate = pickBestCandidate(platform, items, normalizedUrl, targetKey);
      if (candidate && platform.collectExtraTexts) {
        candidate.extraTexts = await platform.collectExtraTexts(candidate.post);
      }
      if (candidate) candidates.push(candidate);

      timer.mark(`apify_${attempt.label}_done`, {
        actor: attempt.actor,
        itemsCount: items.length,
        providerErrorCode: errorCode ?? undefined,
        bestScore: candidate?.score ?? 0,
        bestCaptionLength: candidate?.caption.length ?? 0,
        extraTextCount: candidate?.extraTexts.length ?? 0,
      });
    } catch (error) {
      lastError = error;
      timer.mark(`apify_${attempt.label}_done`, {
        actor: attempt.actor,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const candidate = selectBestCandidate(candidates);
  if (!candidate) {
    if (unavailableCode) throw postUnavailableError(platform.label, unavailableCode);
    if (lastError) throw serviceUnavailableError(platform.label, normalizedUrl);
    throw noRecipeContentError(`${platform.label} lieferte keinen auswertbaren Beitragstext.`);
  }

  timer.mark("candidate_selected", {
    score: candidate.score,
    candidateUrl: candidate.canonicalUrl,
    candidateKey: candidate.key,
  });

  const caption = candidate.caption.trim();
  const geminiInputText = buildGeminiInput(
    caption,
    extractTextCandidates(candidate.post, platform.textPaths),
    candidate.extraTexts,
    { maxParts: platform.maxTextParts, maxChars: platform.maxGeminiInputChars },
  );
  timer.mark("gemini_input_ready", { captionLength: caption.length, inputLength: geminiInputText.length });

  if (!geminiInputText) {
    throw noRecipeContentError(`${platform.label} lieferte keinen Text für die Rezept-Extraktion.`);
  }

  let recipeData: RecipeData;
  try {
    recipeData = await extractRecipeWithGemini(platform, geminiInputText, caption, targetKey, timer);
    timer.mark("gemini_structured_ok", {
      ingredients: recipeData.ingredients.length,
      instructions: recipeData.instructions.length,
    });
  } catch (geminiError) {
    timer.mark("gemini_structured_failed", {
      error: geminiError instanceof Error ? geminiError.message : String(geminiError),
    });
    throw noRecipeContentError(`Aus dem ${platform.label}-Text konnte kein strukturiertes Rezept erstellt werden.`);
  }

  // Zweiter Dedupe-Check: ein paralleler Import kann das Rezept inzwischen angelegt haben.
  const finalExisting = await ctx.runQuery(internal.recipes.getBySourceUrlForUser, {
    userId: args.userId,
    url: normalizedUrl,
  });
  if (finalExisting && finalExisting._id !== staleExistingId) {
    timer.mark("dedupe_final_hit");
    timer.summary({ result: "existing_recipe_final_check" });
    return { recipeId: finalExisting._id };
  }

  timer.summary({ result: "created" });

  return {
    staleRecipeId: staleExistingId ?? undefined,
    payload: {
      title: recipeData.title,
      category: recipeData.category,
      prepTimeMinutes: recipeData.prepTimeMinutes,
      difficulty: recipeData.difficulty,
      portions: recipeData.portions,
      ingredients: recipeData.ingredients,
      instructions: recipeData.instructions,
      image: candidate.imageUrl || undefined,
      sourceImageUrl: candidate.imageUrl || undefined,
      sourceUrl: normalizedUrl,
      imageAlt: recipeData.title,
      isFavorite: false,
    },
  };
}
