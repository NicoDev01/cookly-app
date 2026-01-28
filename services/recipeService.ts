// DEPRECATED: This service is replaced by Convex hooks (useQuery, useMutation).
// See: convex/recipes.ts and components/RecipeDetail.tsx

import { Recipe } from '../types';

export const recipeService = {
    // Placeholder to prevent build errors if referenced elsewhere during migration
    getAll: async () => [],
    getById: async (id: string) => undefined,
};
