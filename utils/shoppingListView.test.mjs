import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShoppingItemKey,
  formatShoppingItemLabel,
  buildLegacyShoppingItemKeys,
  groupShoppingItemsByRecipe,
  groupShoppingItemsBySupermarketSection,
  sortShoppingItemsForSupermarket,
} from './shoppingListView.ts';

const item = (overrides) => ({
  _id: overrides._id,
  name: overrides.name,
  amount: overrides.amount,
  key: overrides.key ?? overrides._id,
  checked: overrides.checked ?? false,
  createdAt: overrides.createdAt,
  recipeId: overrides.recipeId,
  recipeTitle: overrides.recipeTitle,
});

test('buildShoppingItemKey keeps the same ingredient separate per recipe', () => {
  assert.equal(buildShoppingItemKey(' Tomaten ', ' 200 g ', 'recipe-a'), 'tomaten|recipe:recipe-a');
  assert.equal(buildShoppingItemKey('Tomaten', '500 g', 'recipe-a'), 'tomaten|recipe:recipe-a');
  assert.equal(buildShoppingItemKey('Tomaten', '200 g'), 'tomaten');
});

test('buildLegacyShoppingItemKeys includes previous amount and recipe key formats', () => {
  assert.deepEqual(buildLegacyShoppingItemKeys('Tomaten', '200 g', 'recipe-a'), [
    'tomaten|200 g|recipe:recipe-a',
    'tomaten|200 g',
    'tomaten',
  ]);
});

test('formatShoppingItemLabel shows amount before ingredient name', () => {
  assert.equal(formatShoppingItemLabel(item({
    _id: '1',
    name: 'Mehl',
    amount: '200 g',
    createdAt: 1,
  })), '200 g Mehl');
});

test('formatShoppingItemLabel omits empty amounts', () => {
  assert.equal(formatShoppingItemLabel(item({
    _id: '1',
    name: 'Salz',
    amount: ' ',
    createdAt: 1,
  })), 'Salz');
});

test('groupShoppingItemsByRecipe keeps normal mode grouped by recipe creation order', () => {
  const groups = groupShoppingItemsByRecipe([
    item({ _id: '1', name: 'Reis', createdAt: 30, recipeId: 'risotto', recipeTitle: 'Risotto' }),
    item({ _id: '2', name: 'Mehl', createdAt: 10, recipeId: 'broetchen', recipeTitle: 'Brötchen' }),
    item({ _id: '3', name: 'Hefe', createdAt: 20, recipeId: 'broetchen', recipeTitle: 'Brötchen' }),
    item({ _id: '4', name: 'Salz', createdAt: 40 }),
  ]);

  assert.deepEqual(groups.map((group) => group.title), ['Brötchen', 'Risotto', '']);
  assert.deepEqual(groups[0].items.map((entry) => entry.name), ['Mehl', 'Hefe']);
});

test('groupShoppingItemsByRecipe sorts recipe groups by recipe title', () => {
  const groups = groupShoppingItemsByRecipe([
    item({ _id: '1', name: 'Reis', createdAt: 10, recipeId: 'risotto', recipeTitle: 'Risotto' }),
    item({ _id: '2', name: 'Mehl', createdAt: 20, recipeId: 'broetchen', recipeTitle: 'Brötchen' }),
    item({ _id: '3', name: 'Tomate', createdAt: 30, recipeId: 'salat', recipeTitle: 'Tomatensalat' }),
  ]);

  assert.deepEqual(groups.map((group) => group.title), ['Brötchen', 'Risotto', 'Tomatensalat']);
});

test('groupShoppingItemsByRecipe keeps legacy items after recipe groups without a visible title', () => {
  const groups = groupShoppingItemsByRecipe([
    item({ _id: '1', name: 'Salz', createdAt: 5 }),
    item({ _id: '2', name: 'Reis', createdAt: 10, recipeId: 'risotto', recipeTitle: 'Risotto' }),
  ]);

  assert.deepEqual(groups.map((group) => group.title), ['Risotto', '']);
});

test('groupShoppingItemsByRecipe groups inferred recipe titles without stored recipe ids', () => {
  const groups = groupShoppingItemsByRecipe([
    item({ _id: '1', name: 'Reis', createdAt: 10, recipeTitle: 'Risotto' }),
    item({ _id: '2', name: 'Parmesan', createdAt: 11, recipeTitle: 'Risotto' }),
  ]);

  assert.deepEqual(groups.map((group) => group.title), ['Risotto']);
  assert.deepEqual(groups[0].items.map((entry) => entry.name), ['Reis', 'Parmesan']);
});

test('sortShoppingItemsForSupermarket orders ingredients by typical department flow', () => {
  const sorted = sortShoppingItemsForSupermarket([
    item({ _id: '1', name: 'Milch', createdAt: 1 }),
    item({ _id: '2', name: 'Tomaten', createdAt: 2 }),
    item({ _id: '3', name: 'Spaghetti', createdAt: 3 }),
    item({ _id: '4', name: 'Brötchen', createdAt: 4 }),
  ]);

  assert.deepEqual(sorted.map((entry) => entry.name), ['Tomaten', 'Brötchen', 'Milch', 'Spaghetti']);
});

test('groupShoppingItemsBySupermarketSection returns one untitled sorted shopping route', () => {
  const groups = groupShoppingItemsBySupermarketSection([
    item({ _id: '1', name: 'Milch', createdAt: 1 }),
    item({ _id: '2', name: 'Tomaten', createdAt: 2 }),
  ]);

  assert.deepEqual(groups.map((group) => group.title), ['']);
  assert.deepEqual(groups[0].items.map((entry) => entry.name), ['Tomaten', 'Milch']);
});
