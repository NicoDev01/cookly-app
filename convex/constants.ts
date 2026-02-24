/**  
 * Shared constants for rate limiting across the application.  
 * These values are used by both the frontend (via users.ts queries)  
 * and backend (via recipes.ts enforcement).  
 */  
export const FREE_LIMITS = {  
  MANUAL_RECIPES: 100,  
  LINK_IMPORTS: 100,  
  PHOTO_SCANS: 100,  
} as const;
  
export type FreeLimitType = keyof typeof FREE_LIMITS;

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
