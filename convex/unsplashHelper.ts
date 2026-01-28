/**
 * Unsplash Helper - Fallback für Food-Bilder wenn Pollinations down ist
 * Kostenlos: https://unsplash.com/developers
 */

export interface UnsplashPhoto {
  id: string;
  urls: {
    regular: string;
    small: string;
  };
  alt_description?: string;
}

/**
 * Sucht nach Food-Bildern auf Unsplash (ohne API Key - public search)
 */
export async function searchFoodImages(query: string, count: number = 5): Promise<string[]> {
  const searchQuery = `${query} food recipe`;
  const encodedQuery = encodeURIComponent(searchQuery);
  
  // Unsplash Source URL (public endpoint, kein API Key nötig)
  const unsplashUrl = `https://source.unsplash.com/1024x1024/?${encodedQuery}&sig=${Math.random()}`;
  
  return [unsplashUrl];
}

/**
 * Generiert eine konsistente Unsplash URL für ein Rezept
 * (basierend auf dem Titel als Seed)
 */
export function getUnsplashRecipeImageUrl(title: string, width: number = 1024, height: number = 1024): string {
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .substring(0, 50); // Max 50 chars für URL
  
  const query = encodeURIComponent(`${cleanTitle} food photography`);
  const seed = Math.abs(hashString(cleanTitle));
  
  // Unsplash Source mit Seed für Konsistenz
  return `https://source.unsplash.com/${width}x${height}/?${query}&sig=${seed}`;
}

/**
 * Generiert eine konsistente Unsplash URL für eine Kategorie
 */
export function getUnsplashCategoryImageUrl(categoryName: string, width: number = 512, height: number = 512): string {
  const query = encodeURIComponent(`${categoryName} food`);
  const seed = Math.abs(hashString(categoryName));
  
  return `https://source.unsplash.com/${width}x${height}/?${query}&sig=${seed}`;
}

/**
 * Einfacher Hash-String für Consistent Seed
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
