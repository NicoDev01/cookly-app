import type { Recipe } from '../../types';
import { sanitizeInstructionsIcons } from '../../utils/iconUtils.ts';
import type { ManualFormData } from './ManualRecipeForm';

export const PLACEHOLDER_RECIPE_IMAGE =
  'https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=2626&auto=format&fit=crop';

export const createRecipeFormData = (
  recipe?: Recipe | null,
  sourceImageUrl = '',
): ManualFormData => recipe ? {
  title: recipe.title,
  category: recipe.category,
  prepTimeMinutes: recipe.prepTimeMinutes,
  difficulty: recipe.difficulty,
  portions: recipe.portions,
  ingredients: recipe.ingredients.length ? recipe.ingredients : [{ name: '', amount: '' }],
  instructions: recipe.instructions.length
    ? sanitizeInstructionsIcons(recipe.instructions)
    : [{ text: '' }],
  image: recipe.image || PLACEHOLDER_RECIPE_IMAGE,
  imageAlt: recipe.imageAlt || '',
  sourceImageUrl: recipe.sourceImageUrl || '',
} : {
  title: '',
  category: 'Sonstiges',
  prepTimeMinutes: 30,
  difficulty: 'Mittel',
  portions: 4,
  ingredients: [{ name: '', amount: '' }],
  instructions: [{ text: '' }],
  image: PLACEHOLDER_RECIPE_IMAGE,
  imageAlt: 'Leckeres Gericht',
  sourceImageUrl,
};
