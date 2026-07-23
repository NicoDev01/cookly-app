import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('recipe preview query excludes heavy detail fields from list subscriptions', () => {
  const recipes = read('convex/recipes.ts');
  const start = recipes.indexOf('export const listPreviews');
  assert.notEqual(start, -1, 'recipes.listPreviews query is missing');

  const end = recipes.indexOf('// List all recipe IDs', start);
  const listPreviews = recipes.slice(start, end === -1 ? undefined : end);

  assert.match(listPreviews, /title/, 'preview query should return title');
  assert.match(listPreviews, /imageBlurhash/, 'preview query should return image metadata');
  assert.match(listPreviews, /prepTimeMinutes/, 'preview query should return list metadata');
  assert.doesNotMatch(listPreviews, /ingredients\s*:/, 'preview query must not return ingredients');
  assert.doesNotMatch(listPreviews, /instructions\s*:/, 'preview query must not return instructions');
});

test('persistent list surfaces use lightweight recipe previews', () => {
  const tabs = read('components/TabsLayout.tsx');
  const mealPlan = read('components/MealPlanModal.tsx');
  const favorites = read('pages/FavoritesPage.tsx');
  const categoryRecipes = read('pages/CategoryRecipesPage.tsx');

  assert.doesNotMatch(tabs, /api\.recipes\.list/, 'TabsLayout must not subscribe to full recipe docs');
  assert.doesNotMatch(tabs, /prefetchRecipeImages/, 'TabsLayout should not prefetch all recipe images at app start');

  assert.match(mealPlan, /api\.recipes\.listPreviews/, 'MealPlanModal should use recipe previews');
  assert.doesNotMatch(mealPlan, /api\.recipes\.getFavorites/, 'MealPlanModal should not subscribe to full favorite recipes');
  assert.match(mealPlan, /favoritesOnly:\s*true/, 'MealPlanModal should filter favorite previews through Convex');

  assert.match(favorites, /api\.recipes\.listPreviews/, 'FavoritesPage should use favorite previews');
  assert.doesNotMatch(favorites, /api\.recipes\.getFavorites/, 'FavoritesPage should not subscribe to full favorite recipes');

  assert.match(categoryRecipes, /api\.recipes\.listPreviews/, 'CategoryRecipesPage should use recipe previews');
});

test('navigation retains visited views without keeping inactive subscriptions alive', () => {
  const tabs = read('components/TabsLayout.tsx');

  assert.match(tabs, /<Activity/, 'visited views should preserve their UI state');
  assert.match(tabs, /mode=\{currentTab === tabPath \? 'visible' : 'hidden'\}/, 'inactive tabs should suspend effects and subscriptions');
  assert.match(tabs, /slice\(-3\)/, 'category state retention must stay bounded');
  assert.doesNotMatch(tabs, /Promise\.all\(\[\s*import\('\.\.\/pages\//, 'all route chunks must not preload on startup');
});

test('category fallback waits for category stats before loading all recipes', () => {
  const categories = read('pages/CategoriesPage.tsx');

  assert.match(categories, /!categoriesLoading && \(!hasCategoriesInDb \|\| isFiltering\)/);
});

test('image prefetching respects mobile data saver and stays bounded', () => {
  const prefetch = read('prefetch.ts');

  assert.match(prefetch, /PREFETCH_IMAGE_LIMIT\s*=\s*6/, 'image prefetch limit should stay near visible viewport size');
  assert.match(prefetch, /saveData/, 'image prefetch should respect Data Saver mode');
  assert.doesNotMatch(prefetch, /slice\(0,\s*20\)/, 'image prefetch should no longer fetch 20 images');
});

test('list images opt into browser async decoding', () => {
  const imageWithBlurhash = read('components/ImageWithBlurhash.tsx');
  const safeImage = read('components/SafeImage.tsx');

  assert.match(imageWithBlurhash, /decoding\s*=\s*'async'/, 'ImageWithBlurhash should default to async decoding');
  assert.match(imageWithBlurhash, /decoding=\{decoding\}/, 'ImageWithBlurhash should pass decoding to img');
  assert.match(safeImage, /decoding="async"/, 'SafeImage should use async decoding');
});

test('list images load near the viewport instead of preloading every URL', () => {
  const imageWithBlurhash = read('components/ImageWithBlurhash.tsx');

  assert.doesNotMatch(imageWithBlurhash, /new Image\(\)/, 'list images must not start an eager duplicate request');
  assert.match(imageWithBlurhash, /rootMargin: '200px 0px'/, 'images should load shortly before entering the viewport');
});

test('weekly and shopping queries avoid unconditional full scans and N+1 reads', () => {
  const weekly = read('convex/weekly.ts');
  const shopping = read('convex/shopping.ts');

  assert.match(weekly, /\.gte\("date", args\.startDate\)/, 'weekly query should use the date index lower bound');
  assert.match(weekly, /\.lte\("date", args\.endDate\)/, 'weekly query should use the date index upper bound');
  assert.match(weekly, /new Set\(meals\.map/, 'weekly recipe reads should be deduplicated');
  assert.match(shopping, /needsLegacyLookup\s*\?/, 'full recipe lookup should only support legacy items');
  assert.match(shopping, /linkedRecipeIds/, 'linked recipe reads should be batched and deduplicated');
});
