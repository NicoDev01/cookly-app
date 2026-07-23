/**  
 * Shared constants for rate limiting across the application.  
 * These values are used by both the frontend (via users.ts queries)  
 * and backend (via recipes.ts enforcement).  
 */  
export const FREE_LIMITS = {  
  LINK_IMPORTS: 60,
  PHOTO_SCANS: 60,
} as const;
  
export type FreeLimitType = keyof typeof FREE_LIMITS;

export const GEMINI_MODELS = {
  recipeImageScan: "gemini-3.1-flash-lite",
  recipeTextExtraction: "gemini-3.1-flash-lite",
} as const;

export const RECIPE_CATEGORIES = [
  "Pasta",
  "Salat",
  "Suppe",
  "Fleisch",
  "Fisch",
  "Vegetarisch",
  "Vegan",
  "Backen",
  "Dessert",
  "Frühstück",
  "Snack",
  "Beilage",
  "Getränke",
  "Sonstiges"
] as const;

export type RecipeCategory = typeof RECIPE_CATEGORIES[number];
