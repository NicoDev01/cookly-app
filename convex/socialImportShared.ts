// Explizite .ts-Endung, damit dieses Modul direkt in `node --test` importierbar bleibt.
import { RECIPE_CATEGORIES } from "./constants.ts";

// Exportiert für utils/iconScanner.test.mjs - der Font-Subset muss alle hier
// erlaubten Icons enthalten, sonst rendert der Import rohen Ligatur-Text.
export const ALLOWED_MATERIAL_ICONS = new Set([
  "outdoor_grill", "timer", "restaurant", "blender", "oven_gen", "skillet",
  "cookie", "local_pizza", "set_meal", "soup_kitchen", "flatware", "egg",
  "kitchen", "microwave",
]);

export const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? value as Record<string, unknown> : null;

export const isHttpUrl = (value: string): boolean =>
  value.startsWith("https://") || value.startsWith("http://");

export const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

export const getNestedValue = (obj: unknown, path: string): unknown => {
  let current: unknown = obj;
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    const match = part.match(/^(\w+)\[(\d+)\]$/);
    const record = toRecord(current);
    if (!record) return undefined;
    if (!match) {
      current = record[part];
      continue;
    }
    const value = record[match[1]];
    const index = Number(match[2]);
    if (!Array.isArray(value) || index >= value.length) return undefined;
    current = value[index];
  }
  return current;
};

export const uniqueNonEmpty = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

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
  if (/pizza/.test(lower)) return "local_pizza";
  if (/(portionieren|aufteilen)/.test(lower)) return "set_meal";
  return "restaurant";
};

export const normalizeInstructionIcon = (value: unknown, text: string): string => {
  const icon = typeof value === "string" ? value.trim() : "";
  return ALLOWED_MATERIAL_ICONS.has(icon) ? icon : inferInstructionIcon(text);
};

// ---------------------------------------------------------------------------
// Recipe shape shared by every social importer (Instagram, Facebook, TikTok)
// ---------------------------------------------------------------------------

export type RecipeIngredient = { name: string; amount?: string; checked: boolean };
export type RecipeInstruction = { text: string; icon: string };

export type RecipeData = {
  title: string;
  category: string;
  prepTimeMinutes: number;
  difficulty: "Einfach" | "Mittel" | "Schwer";
  portions: number;
  ingredients: RecipeIngredient[];
  instructions: RecipeInstruction[];
  imageKeywords?: string;
};

export const RECIPE_RESPONSE_JSON_SCHEMA = {
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

const GENERIC_TITLE_PATTERNS = [
  /^(instagram|facebook|tiktok) rezept$/i,
  /^rezept von (instagram|facebook|tiktok)$/i,
  /^(instagram|facebook|tiktok) recipe$/i,
  /^recipe from (instagram|facebook|tiktok)$/i,
  /^rezept$/i,
  /^recipe$/i,
  /^untitled$/i,
  /^unbenannt$/i,
];

export const isGenericRecipeTitle = (value: string): boolean => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return true;
  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
};

/** Falls das Modell keinen brauchbaren Titel liefert: erste sinnvolle Caption-Zeile. */
export const deriveTitleFromCaption = (caption: string): string => {
  const lines = caption
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .filter((line) => !/^https?:\/\//i.test(line));

  for (const line of lines) {
    if (line.length < 4) continue;
    if (line.length > 90) continue;
    if (/^\d+[.)]/.test(line)) continue;
    if (isGenericRecipeTitle(line)) continue;
    return line;
  }

  return "";
};

export const hasRecipeHints = (text: string): boolean =>
  /(zutaten|zubereitung|zubereiten|ingredient|ingredients|schritt|steps?|rezept|ofen|backen|kochen|servieren|\d+\s?(g|kg|ml|l|tl|el))/i.test(
    text
  );

/** Ein bestehendes Rezept gilt als "stale", wenn Titel, Zutaten oder Schritte fehlen. */
export const isExistingRecipeUsable = (rawRecipe: unknown): boolean => {
  const recipe = toRecord(rawRecipe);
  if (!recipe) return false;

  const title = typeof recipe.title === "string" ? recipe.title.trim() : "";
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];

  if (!title || isGenericRecipeTitle(title)) return false;
  if (ingredients.length === 0 || instructions.length === 0) return false;

  return true;
};

export const normalizeRecipeData = (raw: unknown): RecipeData => {
  const record = toRecord(raw);
  if (!record) {
    throw new Error("Gemini JSON is not an object");
  }

  const rawIngredients = Array.isArray(record.ingredients) ? record.ingredients : [];
  const ingredients = rawIngredients
    .map((item): RecipeIngredient | null => {
      const entry = toRecord(item);
      if (!entry) return null;
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      if (!name) return null;
      const amount = typeof entry.amount === "string" && entry.amount.trim() ? entry.amount.trim() : undefined;
      return amount ? { name, amount, checked: false } : { name, checked: false };
    })
    .filter((item): item is RecipeIngredient => item !== null);

  const rawInstructions = Array.isArray(record.instructions) ? record.instructions : [];
  const instructions = rawInstructions
    .map((item): RecipeInstruction | null => {
      const entry = toRecord(item);
      if (!entry) return null;
      const text = typeof entry.text === "string" ? entry.text.trim() : "";
      if (!text) return null;
      return { text, icon: normalizeInstructionIcon(entry.icon, text) };
    })
    .filter((item): item is RecipeInstruction => item !== null);

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
  const difficulty =
    difficultyRaw === "Einfach" || difficultyRaw === "Mittel" || difficultyRaw === "Schwer" ? difficultyRaw : "Mittel";

  const title = typeof record.title === "string" ? normalizeWhitespace(record.title) : "";

  const imageKeywords =
    typeof record.imageKeywords === "string" && record.imageKeywords.trim() ? record.imageKeywords.trim() : undefined;

  return { title, category, prepTimeMinutes, difficulty, portions, ingredients, instructions, imageKeywords };
};

// ---------------------------------------------------------------------------
// Extraction from raw Apify dataset items
// ---------------------------------------------------------------------------

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
    for (const key of ["text", "caption", "transcript", "firstComment"] as const) {
      if (typeof record[key] === "string") bucket.push((record[key] as string).trim());
    }
  }
};

export const extractTextCandidates = (
  post: Record<string, unknown>,
  paths: readonly string[],
): string[] => {
  const bucket: string[] = [];
  for (const path of paths) addStringCandidate(bucket, getNestedValue(post, path));
  return uniqueNonEmpty(bucket);
};

/** Längster Textkandidat — in der Praxis der vollständigste. */
export const pickLongestText = (candidates: string[]): string =>
  candidates.length === 0 ? "" : [...candidates].sort((a, b) => b.length - a.length)[0];

export const extractFirstHttpUrl = (
  post: Record<string, unknown>,
  paths: readonly string[],
): string => {
  for (const path of paths) {
    const value = getNestedValue(post, path);
    if (typeof value === "string" && isHttpUrl(value)) return value;
  }
  return "";
};

/**
 * Baut den Gemini-Input: bevorzugter Text zuerst, danach weitere Kandidaten
 * (z. B. Untertitel-Transkripte) — dedupliziert und auf `maxParts` begrenzt.
 */
export const buildGeminiInput = (
  preferred: string,
  candidates: string[],
  extras: string[] = [],
  options: { maxParts?: number; maxChars?: number } = {},
): string => {
  const { maxParts = 6, maxChars } = options;
  const merged: string[] = [];

  for (const entry of [preferred, ...extras, ...candidates]) {
    const normalized = entry.trim();
    if (!normalized) continue;
    if (merged.includes(normalized)) continue;
    merged.push(normalized);
    if (merged.length >= maxParts) break;
  }

  const combined = merged.join("\n\n---\n\n").trim();
  return maxChars && combined.length > maxChars ? combined.slice(0, maxChars).trim() : combined;
};

export type ScrapedCandidate = {
  post: Record<string, unknown>;
  caption: string;
  extraTexts: string[];
  imageUrl: string;
  canonicalUrl: string;
  key: string;
  score: number;
};

export const scoreCandidate = (params: {
  targetCanonicalUrl: string;
  targetKey: string;
  candidateCanonicalUrl: string;
  candidateKey: string;
  caption: string;
  imageUrl: string;
  minCaptionLength: number;
}): number => {
  const {
    targetCanonicalUrl, targetKey, candidateCanonicalUrl, candidateKey,
    caption, imageUrl, minCaptionLength,
  } = params;

  let score = 0;

  score += Math.min(caption.length, 260);
  if (caption.length >= minCaptionLength) score += 40;
  if (hasRecipeHints(caption)) score += 80;
  if (imageUrl) score += 20;

  if (candidateCanonicalUrl && targetCanonicalUrl) {
    if (candidateCanonicalUrl === targetCanonicalUrl) score += 300;

    try {
      if (new URL(targetCanonicalUrl).pathname === new URL(candidateCanonicalUrl).pathname) score += 180;
    } catch {
      // Nicht-parsebare URLs liefern schlicht keinen Bonus.
    }
  }

  if (targetKey && candidateKey && targetKey.toLowerCase() === candidateKey.toLowerCase()) {
    score += 220;
  }

  return score;
};

/** Apify liefert Fehler als reguläre Dataset-Items mit `errorCode` statt den Run abzubrechen. */
export const extractApifyErrorCode = (items: unknown[]): string | null => {
  for (const item of items) {
    const record = toRecord(item);
    const code = record && typeof record.errorCode === "string" ? record.errorCode.trim() : "";
    if (code) return code;
  }
  return null;
};

/**
 * Endauswahl über alle Actor-Versuche. Bei Punktegleichstand (derselbe Beitrag aus
 * Erstversuch und Folgeversuch) gewinnt der Kandidat mit mehr Gesamttext — sonst
 * würde der stabile Sort den Erstversuch wählen und dessen fehlende Untertitel
 * gingen verloren.
 */
/**
 * Der Client pollt den Import nur begrenzt lange (`waitForImport`, 120 s). Ein weiterer
 * Actor-Versuch darf dieses Budget nicht sprengen, sonst sieht der Nutzer einen Timeout,
 * während der Server das Rezept noch schreibt.
 */
export const hasBudgetForAttempt = (
  elapsedMs: number,
  attemptTimeoutMs: number,
  budgetMs: number,
): boolean => elapsedMs + attemptTimeoutMs <= budgetMs;

export const selectBestCandidate = (candidates: ScrapedCandidate[]): ScrapedCandidate | null => {
  if (candidates.length === 0) return null;

  const totalTextLength = ({ caption, extraTexts }: ScrapedCandidate): number =>
    caption.length + extraTexts.reduce((sum, text) => sum + text.length, 0);

  return [...candidates].sort(
    (a, b) => b.score - a.score || totalTextLength(b) - totalTextLength(a),
  )[0];
};
