/**
 * Breite der Listen-Vorschaubilder, die der Server aus hochgeladenen Rezeptfotos erzeugt.
 * 520 px deckt eine Rasterkachel der Favoriten (gut 160 pt) auf 3x-iPhones ab.
 */
export const RECIPE_THUMBNAIL_WIDTH = 520;

/** Vorschaubild nehmen, wenn es für die angezeigte Größe scharf genug ist, sonst das Original. */
export const pickRecipeImage = (image: string, thumbnail: string | undefined, cssWidth: number, pixelRatio: number) =>
  thumbnail && cssWidth > 0 && cssWidth * pixelRatio <= RECIPE_THUMBNAIL_WIDTH ? thumbnail : image;

/**
 * Unsplash-Bilder (Platzhalter für Rezepte ohne Foto) liefert der CDN in jeder Breite;
 * gespeichert ist eine bis zu 2626 px breite Variante. Passend zur angezeigten Größe anfragen
 * (in 200-px-Stufen, damit Liste und Detail sich Cache-Einträge teilen). Andere URLs bleiben unverändert.
 */
export const sizedImageUrl = (url: string, cssWidth: number, pixelRatio: number) => {
  if (!url.startsWith('https://images.unsplash.com/') || cssWidth <= 0) return url;
  const width = Math.min(1600, Math.max(200, Math.ceil((cssWidth * pixelRatio) / 200) * 200));
  const sized = new URL(url);
  sized.searchParams.set('w', String(width));
  return sized.toString();
};
