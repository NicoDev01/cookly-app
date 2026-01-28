/**
 * Pollinations Image URL Generator
 * Generiert URLs für die neue Pollinations API (gen.pollinations.ai)
 * KEIN Download - URLs funktionieren direkt im Browser!
 */

// Einfache Configs - nur Dimensionen
export const RECIPE_IMAGE_CONFIG = {
  width: 1200,
  height: 800,
  model: 'zimage',
};

export const CATEGORY_IMAGE_CONFIG = {
  width: 512,
  height: 512,
  model: 'zimage',
};

/**
 * Bereinigt Text für Prompts (Umlaute, Sonderzeichen)
 */
export function cleanPrompt(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generiert konsistenten Seed aus Text
 */
export function getConsistentSeed(text: string): number {
  let hash = 0;
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Übersetzungen für Kategorien (Deutsch → Englisch)
 * Nur die wichtigsten Kategorien - alles andere nutzt den deutschen Namen direkt
 */
const CATEGORY_TRANSLATIONS: Record<string, string> = {
  "nudeln": "pasta",
  "pasta": "pasta",
  "hauptgericht": "main course",
  "hauptgerichte": "main course",
  "suppen": "soup",
  "suppe": "soup",
  "eintopf": "stew",
  "eintöpfe": "stew",
  "salate": "salad",
  "salat": "salad",
  "dessert": "dessert",
  "desserts": "dessert",
  "frühstück": "breakfast",
  "snacks": "snacks",
  "snack": "snack",
  "getränke": "drink",
  "getränk": "drink",
  "backen": "baking",
  "fleisch": "meat",
  "fisch": "fish",
  "vegetarisch": "vegetarian",
  "vegan": "vegan",
  "beilagen": "side dish",
  "beilage": "side dish",
  "saucen": "sauce",
  "sauce": "sauce",
};

export function getEnglishCategoryTerm(germanName: string): string {
  const normalized = cleanPrompt(germanName);
  // Bei bekannter Übersetzung nutzen, sonst deutschen Namen
  return CATEGORY_TRANSLATIONS[normalized] || normalized;
}

/**
 * Generiert Pollinations URL
 * Format: https://gen.pollinations.ai/image/{prompt}?model=zimage&width=1200&height=800&seed=42&key=API_KEY
 */
function buildPollinationsUrl(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  apiKey: string
): string {
  const encodedPrompt = encodeURIComponent(prompt);
  const params = new URLSearchParams({
    model: 'zimage',
    width: width.toString(),
    height: height.toString(),
    seed: seed.toString(),
    enhance: 'false',
    safe: 'false',  // false für weniger Restriktionen
    key: apiKey,
  });

  return `https://gen.pollinations.ai/image/${encodedPrompt}?${params.toString()}`;
}

/**
 * Generiert URL für Rezeptbild
 */
export function buildRecipeImageUrl(title: string, seed: number, apiKey: string): string {
  const cleanedTitle = cleanPrompt(title);
  const prompt = `professional food photography ${cleanedTitle} delicious meal restaurant quality lighting 8k`;

  return buildPollinationsUrl(
    prompt,
    RECIPE_IMAGE_CONFIG.width,
    RECIPE_IMAGE_CONFIG.height,
    seed,
    apiKey
  );
}

/**
 * Generiert URL für Kategoriebild
 * Nutzt englische Begriffe + minimalistischer Black & White Sketch Stil
 */
export function buildCategoryImageUrl(categoryName: string, seed: number, apiKey: string): string {
  const englishTerm = getEnglishCategoryTerm(categoryName);
  const prompt = `${englishTerm} minimalistic black and white sketch`;

  return buildPollinationsUrl(
    prompt,
    CATEGORY_IMAGE_CONFIG.width,
    CATEGORY_IMAGE_CONFIG.height,
    seed,
    apiKey
  );
}
