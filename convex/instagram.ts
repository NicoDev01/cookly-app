"use node";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { Id } from "./_generated/dataModel";
import { RECIPE_CATEGORIES } from "./constants";
import { getAuthUserId } from "@convex-dev/auth/server";
import { createImportTimer } from "./importTiming";

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const MIN_CAPTION_LENGTH = 12;
const APIFY_PRIMARY_TIMEOUT_MS = 15000;
const APIFY_FALLBACK_TIMEOUT_MS = 10000;
const GENERIC_TITLE_PATTERNS = [
  /^instagram rezept$/i,
  /^rezept von instagram$/i,
  /^instagram recipe$/i,
  /^recipe from instagram$/i,
  /^facebook rezept$/i,
  /^rezept von facebook$/i,
  /^rezept$/i,
  /^recipe$/i,
  /^untitled$/i,
  /^unbenannt$/i,
];

const INSTAGRAM_PROMPT = `
  Extrahiere aus dieser Instagram-Caption ein strukturiertes Rezept:
  - Titel (erste Zeile oder Zusammenfassung)
  - Zutaten (Liste)
  - Zubereitung (Schritte)
  - Quelle: Instagram Post
  - WICHTIG: Gib Titel, Zutaten und Zubereitung IMMER auf Deutsch aus, auch wenn der Quelltext Englisch oder in einer anderen Sprache ist.
  - WICHTIG: Kürze nicht aggressiv. Erhalte alle essenziellen Informationen (Mengen, Zeiten, Temperaturen, Reihenfolge, Hinweise).
  - WICHTIG: Strukturiere die Zubereitung in klare Einzelschritte; lieber mehr präzise Schritte als wenige zusammengefasste.
  - WICHTIG: Jeder Schritt MUSS ein passendes Material-Symbol-Icon enthalten.
  - WICHTIG: Nur "imageKeywords" bleibt auf Englisch.

  Caption:
  {{TEXT}}

  Format:
  {
    "title": "Name des Gerichts (aus dem Text oder erfinde einen passenden)",
    "category": "Eine der folgenden Kategorien (NUR eine davon wählen): Pasta, Salat, Suppe, Fleisch, Fisch, Vegetarisch, Vegan, Backen, Dessert, Frühstück, Snack, Beilage, Getränke, Sonstiges",
    "prepTimeMinutes": Zahl (geschätzt wenn nicht angegeben),
    "difficulty": "Einfach" | "Mittel" | "Schwer",
    "portions": Zahl (Standard 2 wenn nicht angegeben),
    "ingredients": [{"name": "Zutat", "amount": "Menge"}],
    "instructions": [{"text": "Detaillierte Schrittbeschreibung auf Deutsch", "icon": "passendes Material Symbol Icon (snake_case)"}],
    "imageKeywords": "Kurze englische Beschreibung für Bildsuche"
  }

  Wähle für die Icons passende Material Symbols aus (z.B. outdoor_grill, timer, restaurant, blender, oven_gen, skillet, cookie, local_pizza, set_meal, soup_kitchen, flatware, egg, kitchen, microwave).
  Antworte NUR mit dem JSON.
`;

type RecipeData = {
  title: string;
  category: string;
  prepTimeMinutes: number;
  difficulty: "Einfach" | "Mittel" | "Schwer";
  portions: number;
  ingredients: Array<{ name: string; amount?: string; checked?: boolean }>;
  instructions: Array<{ text: string; icon: string }>;
  imageKeywords?: string;
};

type CandidateSource = "posts" | "reels";

type ScrapedCandidate = {
  source: CandidateSource;
  post: Record<string, unknown>;
  caption: string;
  imageUrl: string;
  canonicalUrl: string;
  shortCode: string;
  score: number;
};

const RECIPE_RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["title", "category", "prepTimeMinutes", "difficulty", "portions", "ingredients", "instructions"],
  properties: {
    title: { type: "string" },
    category: { type: "string" },
    prepTimeMinutes: { type: "number" },
    difficulty: { type: "string", enum: ["Einfach", "Mittel", "Schwer"] },
    portions: { type: "number" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          amount: { type: "string" },
        },
      },
    },
    instructions: {
      type: "array",
      items: {
        type: "object",
        required: ["text", "icon"],
        properties: {
          text: { type: "string" },
          icon: { type: "string" },
        },
      },
    },
    imageKeywords: { type: "string" },
  },
} as const;

const INSTAGRAM_TRACKING_PARAMS_TO_DROP = new Set([
  "igsh",
  "igshid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
]);

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const isHttpUrl = (value: string): boolean => {
  return value.startsWith("https://") || value.startsWith("http://");
};

const isSupportedInstagramUrl = (rawUrl: string): boolean => {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isInstagramHost = host === "instagram.com" || host.endsWith(".instagram.com");
    if (!isInstagramHost) return false;

    const path = parsed.pathname.toLowerCase();
    return path.includes("/p/") || path.includes("/reel/") || path.includes("/share/");
  } catch {
    return false;
  }
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const ALLOWED_MATERIAL_ICONS = new Set([
  "outdoor_grill",
  "timer",
  "restaurant",
  "blender",
  "oven_gen",
  "skillet",
  "cookie",
  "local_pizza",
  "set_meal",
  "soup_kitchen",
  "flatware",
  "egg",
  "kitchen",
  "microwave",
]);

const inferInstructionIcon = (text: string): string => {
  const lower = text.toLowerCase();
  if (/(ofen|vorheizen|backen|bake|roast)/.test(lower)) return "oven_gen";
  if (/(anbraten|braten|fry|saute|pfanne)/.test(lower)) return "skillet";
  if (/(grill|grillen|bbq)/.test(lower)) return "outdoor_grill";
  if (/(mix|mixen|rühren|verrühren|blenden|pürieren)/.test(lower)) return "blender";
  if (/(kochen|köcheln|simmer|suppe|eintopf)/.test(lower)) return "soup_kitchen";
  if (/(schneiden|hacken|würfeln|slice|chop|julienne)/.test(lower)) return "kitchen";
  if (/(ruhen|ziehen lassen|minuten|sekunden|timer|warten)/.test(lower)) return "timer";
  if (/(servieren|anrichten|garnieren|serve)/.test(lower)) return "flatware";
  if (/(mikrowelle|microwave)/.test(lower)) return "microwave";
  if (/(ei|eier|egg)/.test(lower)) return "egg";
  if (/(keks|cookie|teig|dessert|kuchen)/.test(lower)) return "cookie";
  if (/(pizza)/.test(lower)) return "local_pizza";
  if (/(portionieren|aufteilen)/.test(lower)) return "set_meal";
  return "restaurant";
};

const normalizeInstructionIcon = (iconValue: unknown, text: string): string => {
  if (typeof iconValue === "string") {
    const normalized = iconValue.trim();
    if (ALLOWED_MATERIAL_ICONS.has(normalized)) {
      return normalized;
    }
  }
  return inferInstructionIcon(text);
};

const isGenericRecipeTitle = (value: string): boolean => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return true;
  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
};

const deriveTitleFromCaption = (caption: string): string => {
  const lines = caption
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .filter((line) => !/^https?:\/\//i.test(line));

  for (const line of lines) {
    if (line.length < 4) continue;
    if (line.length > 90) continue;
    if (/^\d+[\.\)]/.test(line)) continue;
    if (isGenericRecipeTitle(line)) continue;
    return line;
  }

  return "";
};

const canonicalizeInstagramUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hostname = "www.instagram.com";

    for (const key of [...parsed.searchParams.keys()]) {
      if (INSTAGRAM_TRACKING_PARAMS_TO_DROP.has(key) || key.startsWith("utm_")) {
        parsed.searchParams.delete(key);
      }
    }

    parsed.hash = "";

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "p" || parts[0] === "reel")) {
      parsed.pathname = `/${parts[0]}/${parts[1]}/`;
    } else {
      parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
      if (!parsed.pathname.endsWith("/")) parsed.pathname = `${parsed.pathname}/`;
    }

    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
};

const shouldResolveInstagramRedirect = (canonicalUrl: string): boolean => {
  try {
    const parsed = new URL(canonicalUrl);
    return parsed.pathname.startsWith("/share/");
  } catch {
    return false;
  }
};

const normalizeInstagramUrl = async (rawUrl: string): Promise<string> => {
  let canonical = canonicalizeInstagramUrl(rawUrl);

  if (!shouldResolveInstagramRedirect(canonical)) {
    return canonical;
  }

  try {
    const response = await fetch(canonical, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(4500),
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (response.url) {
      canonical = canonicalizeInstagramUrl(response.url);
    }
  } catch {
    // Best effort only.
  }

  return canonical;
};

const getNestedValue = (obj: unknown, path: string): unknown => {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    const arrMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrMatch) {
      const [, key, indexRaw] = arrMatch;
      const index = Number(indexRaw);
      const record = toRecord(current);
      if (!record) return undefined;
      const arrValue = record[key];
      if (!Array.isArray(arrValue) || index < 0 || index >= arrValue.length) return undefined;
      current = arrValue[index];
      continue;
    }

    const record = toRecord(current);
    if (!record) return undefined;
    current = record[part];
  }

  return current;
};

const addStringCandidate = (bucket: string[], value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) bucket.push(trimmed);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) addStringCandidate(bucket, item);
    return;
  }

  const record = toRecord(value);
  if (record) {
    if (typeof record.text === "string") bucket.push(record.text.trim());
    if (typeof record.caption === "string") bucket.push(record.caption.trim());
    if (typeof record.transcript === "string") bucket.push(record.transcript.trim());
    if (typeof record.firstComment === "string") bucket.push(record.firstComment.trim());
  }
};

const uniqueNonEmpty = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
};

const extractCaptionCandidates = (post: Record<string, unknown>): string[] => {
  const bucket: string[] = [];

  const paths = [
    "caption",
    "text",
    "transcript",
    "message.text",
    "edge_media_to_caption.edges[0].node.text",
    "title",
  ];

  for (const path of paths) {
    addStringCandidate(bucket, getNestedValue(post, path));
  }

  return uniqueNonEmpty(bucket);
};

const extractCaptionFromPost = (post: Record<string, unknown>): string => {
  const candidates = extractCaptionCandidates(post);
  if (candidates.length === 0) return "";
  return candidates.sort((a, b) => b.length - a.length)[0];
};

const buildGeminiInputFromPost = (post: Record<string, unknown>, preferredCaption: string): string => {
  const candidates = extractCaptionCandidates(post);
  const merged: string[] = [];

  if (preferredCaption.trim()) {
    merged.push(preferredCaption.trim());
  }

  for (const entry of candidates) {
    const normalized = entry.trim();
    if (!normalized) continue;
    if (merged.includes(normalized)) continue;
    merged.push(normalized);
    if (merged.length >= 6) break;
  }

  return merged.join("\n\n---\n\n").trim();
};

const extractImageFromPost = (post: Record<string, unknown>): string => {
  const imagePaths = [
    "images[0]",
    "displayUrl",
    "displayResourceUrls[0]",
    "thumbnailUrl",
    "image.url",
  ];

  for (const path of imagePaths) {
    const value = getNestedValue(post, path);
    if (typeof value === "string" && isHttpUrl(value)) {
      return value;
    }
  }

  return "";
};

const extractPrimaryUrlFromPost = (post: Record<string, unknown>): string => {
  const urlPaths = ["url", "inputUrl", "permalink", "postUrl"];

  for (const path of urlPaths) {
    const value = getNestedValue(post, path);
    if (typeof value === "string" && isHttpUrl(value)) {
      return value;
    }
  }

  const shortCode = typeof post.shortCode === "string" ? post.shortCode : "";
  if (shortCode) {
    return `https://www.instagram.com/p/${shortCode}/`;
  }

  return "";
};

const extractShortCodeFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "p" || parts[0] === "reel")) {
      return parts[1];
    }
  } catch {
    // ignore
  }
  return "";
};

const hasRecipeHints = (text: string): boolean => {
  return /(zutaten|zubereitung|zubereiten|ingredient|ingredients|schritt|steps?|rezept|ofen|backen|kochen|servieren|\d+\s?(g|kg|ml|l|tl|el))/i.test(
    text
  );
};

const scoreCandidate = (params: {
  targetCanonicalUrl: string;
  targetShortCode: string;
  candidateCanonicalUrl: string;
  candidateShortCode: string;
  caption: string;
  imageUrl: string;
  source: CandidateSource;
}): number => {
  const {
    targetCanonicalUrl,
    targetShortCode,
    candidateCanonicalUrl,
    candidateShortCode,
    caption,
    imageUrl,
    source,
  } = params;

  let score = 0;

  score += Math.min(caption.length, 260);
  if (caption.length >= MIN_CAPTION_LENGTH) score += 40;
  if (hasRecipeHints(caption)) score += 80;
  if (imageUrl) score += 20;

  if (candidateCanonicalUrl && targetCanonicalUrl) {
    if (candidateCanonicalUrl === targetCanonicalUrl) score += 300;

    try {
      const targetPath = new URL(targetCanonicalUrl).pathname;
      const candidatePath = new URL(candidateCanonicalUrl).pathname;
      if (targetPath === candidatePath) score += 180;
    } catch {
      // ignore
    }
  }

  if (targetShortCode && candidateShortCode && targetShortCode === candidateShortCode) {
    score += 220;
  }

  if (source === "reels" && targetCanonicalUrl.includes("/reel/")) {
    score += 50;
  }

  return score;
};

const isCandidateMatchingTarget = (targetShortCode: string, candidate: ScrapedCandidate): boolean => {
  if (!targetShortCode) return true;

  if (candidate.shortCode && candidate.shortCode.toLowerCase() === targetShortCode.toLowerCase()) {
    return true;
  }

  if (!candidate.canonicalUrl) {
    // Apify may occasionally omit stable URL fields for some reel responses.
    return true;
  }

  try {
    const candidatePath = new URL(candidate.canonicalUrl).pathname.toLowerCase();
    const target = targetShortCode.toLowerCase();

    if (candidatePath.includes(`/${target}/`)) {
      return true;
    }

    const parts = candidatePath.split("/").filter(Boolean);
    if ((parts[0] === "p" || parts[0] === "reel") && parts[1] && parts[1] !== target) {
      return false;
    }

    return true;
  } catch {
    const lowered = candidate.canonicalUrl.toLowerCase();
    const target = targetShortCode.toLowerCase();
    if (lowered.includes(target)) return true;
    return true;
  }
};

const isExistingRecipeUsable = (rawRecipe: unknown): boolean => {
  const recipe = toRecord(rawRecipe);
  if (!recipe) return false;

  const title = typeof recipe.title === "string" ? recipe.title.trim() : "";
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];

  if (!title || isGenericRecipeTitle(title)) return false;
  if (ingredients.length === 0 || instructions.length === 0) return false;

  return true;
};

const toStructuredError = (payload: Record<string, unknown>): Error => {
  return new Error(JSON.stringify(payload));
};

const buildNoRecipeContentError = (message: string) =>
  toStructuredError({
    type: "NO_RECIPE_CONTENT",
    message,
  });

const runApifyActor = async (
  actorName: string,
  input: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown[]> => {
  const response = await fetch(
    `https://api.apify.com/v2/acts/${actorName}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    }
  );

  if (!response.ok) {
    throw new Error(`Apify ${actorName} failed: ${response.status} ${response.statusText}`);
  }

  const items = await response.json();
  if (!Array.isArray(items)) {
    throw new Error(`Apify ${actorName} returned non-array dataset items`);
  }

  return items;
};

const pickBestCandidate = (
  items: unknown[],
  source: CandidateSource,
  targetCanonicalUrl: string,
  targetShortCode: string
): ScrapedCandidate | null => {
  let best: ScrapedCandidate | null = null;

  for (const item of items) {
    const post = toRecord(item);
    if (!post) continue;

    const caption = extractCaptionFromPost(post);
    const imageUrl = extractImageFromPost(post);
    const primaryUrl = extractPrimaryUrlFromPost(post);
    const candidateCanonicalUrl = primaryUrl ? canonicalizeInstagramUrl(primaryUrl) : "";

    const candidateShortCodeFromUrl = extractShortCodeFromUrl(candidateCanonicalUrl);
    const candidateShortCode =
      (typeof post.shortCode === "string" && post.shortCode) ||
      (typeof post.postId === "string" && post.postId) ||
      candidateShortCodeFromUrl;

    const score = scoreCandidate({
      targetCanonicalUrl,
      targetShortCode,
      candidateCanonicalUrl,
      candidateShortCode,
      caption,
      imageUrl,
      source,
    });

    const candidate: ScrapedCandidate = {
      source,
      post,
      caption,
      imageUrl,
      canonicalUrl: candidateCanonicalUrl,
      shortCode: candidateShortCode,
      score,
    };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
};

const normalizeRecipeData = (raw: unknown): RecipeData => {
  const record = toRecord(raw);
  if (!record) {
    throw new Error("Gemini JSON is not an object");
  }

  const rawIngredients = Array.isArray(record.ingredients) ? record.ingredients : [];
  const ingredients = rawIngredients
    .map((item) => {
      const entry = toRecord(item);
      if (!entry) return null;
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      if (!name) return null;
      const amount = typeof entry.amount === "string" && entry.amount.trim() ? entry.amount.trim() : undefined;
      return { name, amount, checked: false };
    })
    .filter((item): item is { name: string; amount?: string; checked?: boolean } => item !== null);

  const rawInstructions = Array.isArray(record.instructions) ? record.instructions : [];
  const instructions = rawInstructions
    .map((item) => {
      const entry = toRecord(item);
      if (!entry) return null;
      const text = typeof entry.text === "string" ? entry.text.trim() : "";
      if (!text) return null;
      const icon = normalizeInstructionIcon(entry.icon, text);
      return { text, icon };
    })
    .filter((item): item is { text: string; icon: string } => item !== null);

  const rawCategory = typeof record.category === "string" ? record.category : "Sonstiges";
  const category = (RECIPE_CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : "Sonstiges";

  const prepTimeMinutes =
    typeof record.prepTimeMinutes === "number" && Number.isFinite(record.prepTimeMinutes) && record.prepTimeMinutes > 0
      ? Math.round(record.prepTimeMinutes)
      : 15;

  const portions =
    typeof record.portions === "number" && Number.isFinite(record.portions) && record.portions > 0
      ? Math.round(record.portions)
      : 2;

  const difficultyRaw = typeof record.difficulty === "string" ? record.difficulty : "Mittel";
  const difficulty = difficultyRaw === "Einfach" || difficultyRaw === "Mittel" || difficultyRaw === "Schwer" ? difficultyRaw : "Mittel";

  const title = typeof record.title === "string" ? normalizeWhitespace(record.title) : "";

  const imageKeywords =
    typeof record.imageKeywords === "string" && record.imageKeywords.trim() ? record.imageKeywords.trim() : undefined;

  return {
    title,
    category,
    prepTimeMinutes,
    difficulty,
    portions,
    ingredients,
    instructions,
    imageKeywords,
  };
};

export const scrapePost = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<Id<"recipes">> => {
    const timer = createImportTimer("instagram", { url: args.url });

    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN is missing in Convex Environment Variables");
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is missing in Convex Environment Variables");
    timer.mark("env_checked");

    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("NOT_AUTHENTICATED");
    }
    const userIdStr = authUserId.toString();
    timer.mark("authenticated");

    const rateLimit = await ctx.runMutation(internal.rateLimiter.checkAndConsumeRateLimit, {
      identifier: userIdStr,
      bucket: "instagram",
    });
    if (!rateLimit.allowed) {
      throw new Error(
        JSON.stringify({
          type: "RATE_LIMIT_EXCEEDED",
          resetAt: rateLimit.resetAt,
          message: "Du hast zu viele Anfragen gestellt. Bitte warte einen Moment.",
        })
      );
    }
    timer.mark("rate_limit_checked");

    if (!isSupportedInstagramUrl(args.url)) {
      throw new Error("INVALID_INSTAGRAM_URL");
    }

    const normalizedUrl = await normalizeInstagramUrl(args.url);
    timer.mark("url_normalized", { normalizedUrl });

    let staleExistingId: Id<"recipes"> | null = null;
    const existingId = await ctx.runQuery(api.recipes.getBySourceUrl, { url: normalizedUrl });
    if (existingId) {
      const existingRecipe = await ctx.runQuery(api.recipes.get, { id: existingId });
      if (isExistingRecipeUsable(existingRecipe)) {
        timer.mark("dedupe_hit");
        timer.summary({ result: "existing_recipe" });
        return existingId;
      }

      staleExistingId = existingId;
      timer.mark("dedupe_stale_hit", { existingId });
    }
    timer.mark("dedupe_miss");

    const isReelUrl = normalizedUrl.includes("/reel/");
    const targetShortCode = extractShortCodeFromUrl(normalizedUrl);

    let primaryError: unknown = null;
    let fallbackError: unknown = null;
    const primaryActorName = isReelUrl ? "apify~instagram-reel-scraper" : "apify~instagram-scraper";
    const fallbackActorName = isReelUrl ? "apify~instagram-scraper" : "apify~instagram-reel-scraper";
    const primarySource: CandidateSource = isReelUrl ? "reels" : "posts";
    const fallbackSource: CandidateSource = isReelUrl ? "posts" : "reels";

    let bestPrimaryCandidate: ScrapedCandidate | null = null;
    try {
      const primaryItems =
        primarySource === "reels"
          ? await runApifyActor(
              primaryActorName,
              {
                username: [normalizedUrl],
                resultsLimit: 1,
              },
              APIFY_PRIMARY_TIMEOUT_MS
            )
          : await runApifyActor(
              primaryActorName,
              {
                directUrls: [normalizedUrl],
                resultsType: "posts",
                resultsLimit: 1,
              },
              APIFY_PRIMARY_TIMEOUT_MS
            );

      bestPrimaryCandidate = pickBestCandidate(primaryItems, primarySource, normalizedUrl, targetShortCode);
      timer.mark("apify_primary_done", {
        actor: primaryActorName,
        itemsCount: primaryItems.length,
        bestScore: bestPrimaryCandidate?.score ?? 0,
        bestCaptionLength: bestPrimaryCandidate?.caption.length ?? 0,
      });
    } catch (error) {
      primaryError = error;
      timer.mark("apify_primary_done", {
        actor: primaryActorName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    let bestFallbackCandidate: ScrapedCandidate | null = null;
    const needsFallback = !bestPrimaryCandidate;

    if (needsFallback) {
      try {
        const fallbackItems =
          fallbackSource === "reels"
            ? await runApifyActor(
                fallbackActorName,
                {
                  username: [normalizedUrl],
                  resultsLimit: 1,
                },
                APIFY_FALLBACK_TIMEOUT_MS
              )
            : await runApifyActor(
                fallbackActorName,
                {
                  directUrls: [normalizedUrl],
                  resultsType: "posts",
                  resultsLimit: 1,
                },
                APIFY_FALLBACK_TIMEOUT_MS
              );

        bestFallbackCandidate = pickBestCandidate(fallbackItems, fallbackSource, normalizedUrl, targetShortCode);
        timer.mark("apify_reels_fallback_done", {
          actor: fallbackActorName,
          itemsCount: fallbackItems.length,
          bestScore: bestFallbackCandidate?.score ?? 0,
          bestCaptionLength: bestFallbackCandidate?.caption.length ?? 0,
        });
      } catch (error) {
        fallbackError = error;
        timer.mark("apify_reels_fallback_done", {
          actor: fallbackActorName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const selectedCandidate = [bestPrimaryCandidate, bestFallbackCandidate]
      .filter((candidate): candidate is ScrapedCandidate => Boolean(candidate))
      .sort((a, b) => b.score - a.score)[0];

    const bothFailed = primaryError && (!needsFallback || fallbackError);
    if (!selectedCandidate) {
      if (bothFailed) {
        throw toStructuredError({
          type: "API_UNAVAILABLE",
          service: "apify",
          fallbackMode: "manual",
          prefillUrl: normalizedUrl,
          message: "Der Instagram-Service ist gerade nicht verfügbar. Bitte versuche es gleich erneut.",
        });
      }
      throw buildNoRecipeContentError("Instagram lieferte keinen auswertbaren Beitragstext.");
    }
    const candidate = selectedCandidate;

    timer.mark("candidate_selected", {
      source: candidate.source,
      score: candidate.score,
      candidateUrl: candidate.canonicalUrl,
      candidateShortCode: candidate.shortCode,
    });

    if (!isCandidateMatchingTarget(targetShortCode, candidate)) {
      timer.mark("content_validation_failed", {
        reason: "candidate_mismatch",
        targetShortCode,
        candidateShortCode: candidate.shortCode,
        candidateUrl: candidate.canonicalUrl,
      });
      timer.mark("candidate_mismatch_soft");
    }

    const caption = candidate.caption.trim();
    const imageUrl = candidate.imageUrl;
    timer.mark("caption_ready", { captionLength: caption.length, hasImage: !!imageUrl });
    const geminiInputText = buildGeminiInputFromPost(candidate.post, caption);
    timer.mark("gemini_input_ready", { inputLength: geminiInputText.length });
    if (!geminiInputText) {
      throw buildNoRecipeContentError("Instagram lieferte keinen Text für die Rezept-Extraktion.");
    }

    let recipeData: RecipeData;
    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
      const prompt = INSTAGRAM_PROMPT.replace("{{TEXT}}", geminiInputText || caption);

      const result = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: RECIPE_RESPONSE_JSON_SCHEMA,
          temperature: 0,
        },
      });

      const responseText = result.text || "";
      if (!responseText) {
        throw new Error("Gemini returned empty response");
      }

      const parsed = JSON.parse(responseText);
      recipeData = normalizeRecipeData(parsed);

      if (!recipeData.title || isGenericRecipeTitle(recipeData.title)) {
        const derivedTitle = deriveTitleFromCaption(caption);
        recipeData.title = derivedTitle || `Rezept ${targetShortCode || "Instagram"}`;
      }

      if (recipeData.ingredients.length === 0 || recipeData.instructions.length === 0) {
        timer.mark("content_validation_failed", {
          reason: "gemini_missing_recipe_sections",
          ingredients: recipeData.ingredients.length,
          instructions: recipeData.instructions.length,
        });

        // Retry once with stronger extraction instructions for short/sparse reel text.
        const recoveryPrompt = `
          Du bekommst einen eher kurzen Instagram-Reel-Text.
          Extrahiere trotzdem ein brauchbares, detailliertes Kochrezept.
          WICHTIG: Ausgabe IMMER auf Deutsch (Titel, Zutaten, Schritte), auch wenn der Text nicht Deutsch ist.
          Kürze nicht aggressiv: Erhalte essenzielle Infos wie Mengen, Zeiten, Temperaturen und Hinweise.
          Strukturiere in klare Einzelschritte und gib zu jedem Schritt ein passendes Material-Symbol-Icon an.
          Wenn Mengen fehlen, schätze sinnvolle Mengen konservativ.
          Nur "imageKeywords" bleibt auf Englisch.
          Nutze exakt dasselbe JSON-Schema.

          Text:
          ${geminiInputText || caption}
        `;

        const recovery = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
          contents: recoveryPrompt,
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: RECIPE_RESPONSE_JSON_SCHEMA,
            temperature: 0,
          },
        });

        const recoveryText = recovery.text || "";
        if (!recoveryText) {
          throw new Error("Gemini recovery returned empty response");
        }

        const recoveryParsed = JSON.parse(recoveryText);
        const recovered = normalizeRecipeData(recoveryParsed);
        if (recovered.ingredients.length === 0 || recovered.instructions.length === 0) {
          throw new Error("Gemini recovery returned recipe without ingredients or instructions");
        }

        if (!recovered.title || isGenericRecipeTitle(recovered.title)) {
          const derivedTitle = deriveTitleFromCaption(caption);
          recovered.title = derivedTitle || `Rezept ${targetShortCode || "Instagram"}`;
        }

        recipeData = recovered;
      }

      if (!recipeData.title || isGenericRecipeTitle(recipeData.title)) {
        recipeData.title = deriveTitleFromCaption(caption) || `Rezept ${targetShortCode || "Instagram"}`;
      }

      timer.mark("gemini_structured_ok", {
        hasIngredients: recipeData.ingredients.length,
        hasInstructions: recipeData.instructions.length,
      });
    } catch (geminiError) {
      timer.mark("gemini_structured_failed", {
        error: geminiError instanceof Error ? geminiError.message : String(geminiError),
      });
      throw buildNoRecipeContentError("Aus dem Instagram-Text konnte kein strukturiertes Rezept erstellt werden.");
    }

    timer.mark("ready_to_create");

    const finalExisting = await ctx.runQuery(api.recipes.getBySourceUrl, { url: normalizedUrl });
    if (finalExisting && finalExisting !== staleExistingId) {
      timer.mark("dedupe_final_hit");
      timer.summary({ result: "existing_recipe_final_check" });
      return finalExisting;
    }
    timer.mark("dedupe_final_miss_or_stale_update");

    const payload = {
      title: recipeData.title,
      category: recipeData.category,
      prepTimeMinutes: recipeData.prepTimeMinutes,
      difficulty: recipeData.difficulty,
      portions: recipeData.portions,
      ingredients: recipeData.ingredients,
      instructions: recipeData.instructions,
      image: imageUrl || undefined,
      sourceImageUrl: imageUrl || undefined,
      sourceUrl: normalizedUrl,
      imageAlt: recipeData.title,
      isFavorite: false,
    } as const;

    try {
      if (staleExistingId) {
        await ctx.runMutation(api.recipes.update, {
          id: staleExistingId,
          ...payload,
        });

        timer.mark("recipe_updated_from_stale", { recipeId: staleExistingId });
        timer.summary({ result: "updated_stale_recipe" });
        return staleExistingId;
      }

      const newRecipeId = await ctx.runMutation(api.recipes.create, payload);

      timer.mark("recipe_created", { recipeId: newRecipeId });
      timer.summary({ result: "created" });
      return newRecipeId;
    } catch (createError: unknown) {
      const errStr = createError instanceof Error ? createError.message : "";
      if (errStr.includes("LIMIT_REACHED")) {
        throw createError;
      }
      throw new Error("Fehler beim Speichern des Rezepts.");
    }
  },
});
