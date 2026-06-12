/**
 * Pollinations Image URL Generator
 * Generiert keylose URLs für Pollinations.
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
 * Format: https://image.pollinations.ai/prompt/{prompt}?model=klein&width=1024&height=1024&seed=42&nologo=true
 */
function buildPollinationsUrl(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  model: string
): string {
  const encodedPrompt = encodeURIComponent(prompt);
  const params = new URLSearchParams({
    model,
    width: width.toString(),
    height: height.toString(),
    seed: seed.toString(),
    nologo: 'true',
  });

  return `https://image.pollinations.ai/prompt/${encodedPrompt}?${params.toString()}`;
}

/**
 * Generiert URL für Rezeptbild
 */
export function buildRecipeImageUrl(title: string, seed: number): string {
  const cleanedTitle = cleanPrompt(title);
  const prompt = `professional food photography ${cleanedTitle} delicious meal restaurant quality lighting 8k`;

  return buildPollinationsUrl(
    prompt,
    RECIPE_IMAGE_CONFIG.width,
    RECIPE_IMAGE_CONFIG.height,
    seed,
    RECIPE_IMAGE_CONFIG.model
  );
}

export function stripPollinationsApiKeyFromUrl(value?: string): string | undefined {
  if (!value) return value;

  try {
    const url = new URL(value);
    if (!url.hostname.endsWith("pollinations.ai")) return value;
    url.searchParams.delete("key");
    return url.toString();
  } catch {
    return value;
  }
}
