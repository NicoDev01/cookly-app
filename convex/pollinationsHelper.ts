/**
 * Pollinations Image URL Generator
 * Generiert URLs für die neue Pollinations API (gen.pollinations.ai)
 * KEIN Download - URLs funktionieren direkt im Browser!
 */

// Einfache Configs - nur Dimensionen
export const RECIPE_IMAGE_CONFIG = {
  width: 1024,
  height: 1024,
  model: 'klein',
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
 * Generiert Pollinations URL
 * Format: https://gen.pollinations.ai/image/{prompt}?model=klein&width=1024&height=1024&seed=42&key=API_KEY
 */
function buildPollinationsUrl(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  model: string,
  apiKey: string
): string {
  const encodedPrompt = encodeURIComponent(prompt);
  const params = new URLSearchParams({
    model: model,
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
    RECIPE_IMAGE_CONFIG.model,
    apiKey
  );
}