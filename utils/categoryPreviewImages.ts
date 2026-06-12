const MAX_CATEGORY_PREVIEW_IMAGES = 4;

export function getCategoryPreviewImages(
  recipeImages: readonly (string | null | undefined)[] = [],
  fallbackImage?: string | null
): string[] {
  const images = recipeImages
    .filter((image): image is string => typeof image === "string" && image.trim().length > 0)
    .slice(0, MAX_CATEGORY_PREVIEW_IMAGES);

  if (images.length > 0) return images;

  return fallbackImage ? [fallbackImage] : [];
}
