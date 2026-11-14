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
import { GEMINI_TEXT_TIMEOUT_MS, isRetryableGeminiError, runWithGeminiModelFallback } from "../utils/geminiRetry";
import { runApifyActorUntilDone } from "./lib/apifyRun";
import { runAttemptPlan } from "./lib/attemptPlan";
import { cachedImportResult, type ImportCacheInfo } from "./importCache";
import { socialCacheKey } from "./lib/importCacheKey";

const GEMINI_RETRY_DELAYS_MS = [1_500, 4_000] as const;

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

/**
 * Obergrenze für die gesamte Scraping-Phase (alle Actor-Versuche zusammen). Danach bleiben
 * innerhalb des 150-s-Client-Budgets noch ~55 s für Untertitel, Gemini und die Convex-Writes.
 */
const SCRAPE_PHASE_BUDGET_MS = 95_000;
/** Kürzer lohnt kein Actor-Start mehr (Apify braucht selbst im besten Fall einige Sekunden). */
const MIN_ATTEMPT_MS = 5_000;

/**
 * Apify meldet fachliche Probleme (privat, gelöscht, gesperrt) nicht als HTTP-Fehler,
 * sondern als Dataset-Item mit `errorCode`. Diese hier sind für den Nutzer erklärbar.
 */
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
  /**
   * Ist dieser Versuch nach so vielen ms nicht fertig, startet der nächste parallel; der erste
   * brauchbare gewinnt, der andere Lauf wird abgebrochen. Nur für Versuche, deren Folgeversuch
   * nicht vom Ergebnis abhängt (`shouldRetry` = "kein Kandidat").
   */
  hedgeAfterMs?: number;
};

/** Messwerte der Scraping-Phase für Analytics (keine personenbezogenen Daten). */
export type ScrapeStats = {
  scrapeMs: number;
  attemptsStarted: number;
  hedged: boolean;
  winner?: string;
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

  /**
   * Schneller Weg ohne Apify (z. B. öffentliche TikTok-Videoseite). Liefert er einen Kandidaten mit genug Text
   * (`shouldRetry` false), entfällt die Scraping-Phase. Sonst oder bei Fehlern (null) läuft der normale Apify-Plan.
   */
  fastCandidate?(context: { url: string; targetKey: string }): Promise<ScrapedCandidate | null>;

  buildPrompt(text: string): string;
  buildRecoveryPrompt(text: string): string;
};

export type SocialImportResult =
  | { recipeId: Id<"recipes"> }
  | { staleRecipeId?: Id<"recipes">; payload: Record<string, unknown>; scrapeStats?: ScrapeStats; cache?: ImportCacheInfo };

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

const geminiUnavailableError = (prefillUrl: string) =>
  toStructuredError({
    type: "API_UNAVAILABLE",
    service: "gemini",
    fallbackMode: "manual",
    prefillUrl,
    message: "Die Rezeptanalyse ist gerade überlastet. Bitte versuche es gleich erneut.",
  });

const serviceUnavailableError = (label: string, prefillUrl: string) =>
  toStructuredError({
    type: "API_UNAVAILABLE",
    service: "apify",
    fallbackMode: "manual",
    prefillUrl,
    message: `Der ${label}-Service ist gerade nicht verfügbar. Bitte versuche es gleich erneut.`,
  });

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

  // Kurze Wartezeiten: Scraping kann bereits bis zu 95 s des 150-s-Budgets verbraucht haben.
  const generate = (prompt: string) =>
    runWithGeminiModelFallback(GEMINI_MODELS.recipeTextExtraction, (model) =>
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: RECIPE_RESPONSE_JSON_SCHEMA,
          temperature: 0,
          httpOptions: { timeout: GEMINI_TEXT_TIMEOUT_MS },
        },
      }), {
      delaysMs: GEMINI_RETRY_DELAYS_MS,
      onRetry: ({ attempt, error }) => timer.mark("gemini_retry", {
        attempt,
        error: error instanceof Error ? error.message.slice(0, 200) : String(error),
      }),
      onFallback: ({ from, to }) => timer.mark("gemini_model_fallback", { from, to }),
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
/**
 * Meldet der Import-Seite „Beitrag geladen, Rezept wird erkannt“ samt Vorschaubild.
 * Nur Anzeige: Ein Fehler hier darf den Import nicht abbrechen.
 */
export async function reportExtractingPhase(
  ctx: ActionCtx,
  args: { userId: Id<"users">; operationId?: string },
  previewImageUrl?: string,
) {
  if (!args.operationId) return;
  try {
    await ctx.runMutation(internal.importOperations.markExtracting, {
      userId: args.userId,
      operationId: args.operationId,
      previewImageUrl: previewImageUrl || undefined,
    });
  } catch (error) {
    console.warn("import phase update failed", error instanceof Error ? error.message : String(error));
  }
}

export async function runSocialImport(
  ctx: ActionCtx,
  platform: SocialPlatform,
  args: { userId: Id<"users">; url: string; operationId?: string },
): Promise<SocialImportResult> {
  const timer = createImportTimer(platform.id, { url: args.url });

  const apifyToken = APIFY_TOKEN;
  if (!apifyToken) throw new Error("APIFY_API_TOKEN is missing in Convex Environment Variables");
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

  // --- Geteilter Cache: denselben Beitrag hat schon jemand importiert ----------------------
  const cacheKey = socialCacheKey(platform.id, targetKey);
  const cached = await cachedImportResult(ctx, cacheKey, normalizedUrl);
  if (cached) {
    timer.mark("import_cache_hit");
    timer.summary({ result: "created", path: "cache" });
    return { ...cached, staleRecipeId: staleExistingId ?? undefined };
  }

  const context = { url: normalizedUrl, targetKey };
  const shouldRetry = platform.shouldRetry ?? ((candidate: ScrapedCandidate | null) => !candidate);

  // --- Schneller Weg: reicht sein Text, entfällt Apify komplett --------------------------
  if (platform.fastCandidate && targetKey) {
    const fastStartedAt = Date.now();
    let fast: ScrapedCandidate | null = null;
    try {
      fast = await platform.fastCandidate(context);
    } catch (error) {
      timer.mark("fast_path_failed", { error: error instanceof Error ? error.message.slice(0, 200) : String(error) });
    }
    const usable = !!fast && !shouldRetry(fast, context);
    timer.mark("fast_path_done", {
      durationMs: Date.now() - fastStartedAt,
      found: !!fast,
      usable,
      captionLength: fast?.caption.length ?? 0,
      extraTextCount: fast?.extraTexts.length ?? 0,
    });
    if (fast && usable) {
      return extractAndBuild(ctx, platform, args, timer, {
        candidate: fast,
        normalizedUrl,
        targetKey,
        staleExistingId,
        stats: { scrapeMs: Date.now() - fastStartedAt, attemptsStarted: 0, hedged: false, winner: "page" },
      });
    }
  }

  // --- Apify: Versuche nacheinander (oder abgesichert parallel), bis das Ergebnis reicht --
  const attempts = platform.attempts(context);
  let lastError: unknown = null;
  let unavailableCode: string | null = null;

  const scrapeStartedAt = Date.now();
  const scrapeDeadline = scrapeStartedAt + SCRAPE_PHASE_BUDGET_MS;

  const runAttempt = async (attempt: ApifyAttempt, signal: AbortSignal): Promise<ScrapedCandidate | null> => {
    const startedAt = Date.now();
    try {
      const items = await runApifyActorUntilDone(attempt.actor, attempt.input, {
        token: apifyToken,
        deadlineAt: Math.min(startedAt + attempt.timeoutMs, scrapeDeadline),
        signal,
      });
      const errorCode = extractApifyErrorCode(items);
      if (errorCode && UNAVAILABLE_POST_ERROR_CODES.has(errorCode)) unavailableCode = errorCode;

      const candidate = pickBestCandidate(platform, items, normalizedUrl, targetKey);
      if (candidate && platform.collectExtraTexts) {
        candidate.extraTexts = await platform.collectExtraTexts(candidate.post);
      }
      timer.mark(`apify_${attempt.label}_done`, {
        actor: attempt.actor,
        durationMs: Date.now() - startedAt,
        itemsCount: items.length,
        providerErrorCode: errorCode ?? undefined,
        bestScore: candidate?.score ?? 0,
        bestCaptionLength: candidate?.caption.length ?? 0,
        extraTextCount: candidate?.extraTexts.length ?? 0,
      });
      return candidate;
    } catch (error) {
      if (!signal.aborted) lastError = error;
      timer.mark(`apify_${attempt.label}_done`, {
        actor: attempt.actor,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  const plan = await runAttemptPlan(attempts, {
    run: runAttempt,
    shouldRetry: (best) => shouldRetry(best, context),
    canStart: (attempt) => {
      const elapsedMs = Date.now() - scrapeStartedAt;
      const ok = hasBudgetForAttempt(elapsedMs, attempt.timeoutMs, SCRAPE_PHASE_BUDGET_MS);
      if (!ok) timer.mark("apify_attempt_skipped_no_budget", { attempt: attempt.label, elapsedMs });
      return ok;
    },
    canHedge: () => scrapeDeadline - Date.now() >= MIN_ATTEMPT_MS,
    onHedge: (attempt) => timer.mark("apify_hedge_started", { attempt: attempt.label }),
  });
  const stats: ScrapeStats = {
    scrapeMs: Date.now() - scrapeStartedAt,
    attemptsStarted: plan.attemptsStarted,
    hedged: plan.hedged,
    winner: plan.winner?.label,
  };
  timer.mark("apify_phase_done", { ...stats });

  const candidate = selectBestCandidate(plan.candidates);
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

  return extractAndBuild(ctx, platform, args, timer, { candidate, normalizedUrl, targetKey, staleExistingId, stats });
}

/** Gemini auf den gewählten Kandidaten, letzter Dedupe-Check, Payload. */
async function extractAndBuild(
  ctx: ActionCtx,
  platform: SocialPlatform,
  args: { userId: Id<"users">; url: string; operationId?: string },
  timer: ReturnType<typeof createImportTimer>,
  { candidate, normalizedUrl, targetKey, staleExistingId, stats }: {
    candidate: ScrapedCandidate;
    normalizedUrl: string;
    targetKey: string;
    staleExistingId: Id<"recipes"> | null;
    stats: ScrapeStats;
  },
): Promise<SocialImportResult> {
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
  await reportExtractingPhase(ctx, args, candidate.imageUrl);

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
    // Überlastung/Ausfall bei Gemini ist kein Inhaltsproblem des Beitrags.
    if (isRetryableGeminiError(geminiError)) throw geminiUnavailableError(normalizedUrl);
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

  const cacheKey = socialCacheKey(platform.id, targetKey);
  return {
    staleRecipeId: staleExistingId ?? undefined,
    scrapeStats: stats,
    ...(cacheKey && { cache: { key: cacheKey, hit: false } }),
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
