import test from 'node:test';
import assert from 'node:assert/strict';

import { favoriteChips, favoriteMeta, filterFavorites, parseFavoriteLayout, parseFavoriteSort, placeholderColorIndex, plannedLabels, sortFavorites } from './favoritesView.ts';

const r = (id, title, category, prepTimeMinutes, extra = {}) => ({ _id: id, title, category, prepTimeMinutes, ...extra });
const recipes = [
  r('1', 'Tiramisu', 'Dessert', 40, { createdAt: 1 }),
  r('2', 'Spaghetti Carbonara', 'Pasta', 20, { createdAt: 2, favoritedAt: 50 }),
  r('3', 'Rote-Linsen-Dal', 'Vegetarisch', 35, { createdAt: 3 }),
  r('4', 'Älplermagronen', 'Pasta', 0, { createdAt: 4 }),
];

test('favoriteChips offers quick and categories only when they narrow the list', () => {
  assert.deepEqual(favoriteChips(recipes).map((c) => c.label), ['Bis 30 Min', 'Pasta', 'Dessert', 'Vegetarisch']);
  assert.deepEqual(favoriteChips([recipes[0]]), [], 'one recipe needs no chips');
  assert.deepEqual(favoriteChips([recipes[1], recipes[3]]).map((c) => c.label), ['Bis 30 Min'], 'one category needs no category chips');
});

test('filterFavorites combines chip and search, ignoring case and accents', () => {
  assert.deepEqual(filterFavorites(recipes, '', 'quick').map((x) => x._id), ['2']);
  assert.deepEqual(filterFavorites(recipes, '', 'cat:Pasta').map((x) => x._id), ['2', '4']);
  assert.deepEqual(filterFavorites(recipes, 'alpler', null).map((x) => x._id), ['4']);
  assert.deepEqual(filterFavorites(recipes, 'pasta carb', null).map((x) => x._id), ['2'], 'every term must match title or category');
  assert.deepEqual(filterFavorites(recipes, 'dal', 'cat:Pasta'), []);
});

test('sortFavorites orders by favorite time, name or speed', () => {
  assert.deepEqual(sortFavorites(recipes, 'recent').map((x) => x._id), ['2', '4', '3', '1'], 'favoritedAt wins, else creation time');
  assert.deepEqual(sortFavorites(recipes, 'name').map((x) => x.title), ['Älplermagronen', 'Rote-Linsen-Dal', 'Spaghetti Carbonara', 'Tiramisu']);
  assert.deepEqual(sortFavorites(recipes, 'quick').map((x) => x._id), ['2', '3', '1', '4'], 'missing time goes last');
  assert.equal(parseFavoriteSort('quick'), 'quick');
  assert.equal(parseFavoriteSort('bogus'), 'recent');
});

test('favoriteMeta shows time and category', () => {
  assert.equal(favoriteMeta(recipes[1]), '20 Min · Pasta');
  assert.equal(favoriteMeta(recipes[3]), 'Pasta');
});

test('parseFavoriteLayout keeps the old list setting and defaults to the grid', () => {
  assert.equal(parseFavoriteLayout('compact'), 'list');
  assert.equal(parseFavoriteLayout('list'), 'list');
  assert.equal(parseFavoriteLayout('large'), 'grid');
  assert.equal(parseFavoriteLayout(null), 'grid');
});

test('plannedLabels shows the next upcoming slot of this week', () => {
  const day = (date) => ({ '2026-11-12': 'Do', '2026-11-14': 'Sa' })[date];
  const labels = plannedLabels([
    { recipeId: 'a', date: '2026-11-09', scope: 'day' },
    { recipeId: 'b', date: '2026-11-14', scope: 'day' },
    { recipeId: 'b', date: '2026-11-12', scope: 'day' },
    { recipeId: 'c', date: '2026-11-09', scope: 'week' },
    { recipeId: 'd', date: '2026-11-10', scope: 'day' },
    { recipeId: 'd', date: '2026-11-09', scope: 'week' },
  ], '2026-11-10', day);
  assert.deepEqual(labels, { b: 'Do', c: 'Diese Woche', d: 'Heute' }, 'past days are dropped, a fixed day beats the week');
});

test('placeholderColorIndex is stable per title and stays in the palette', () => {
  assert.equal(placeholderColorIndex('Chili sin Carne'), placeholderColorIndex('Chili sin Carne'));
  for (const title of ['Zitronen-Risotto', 'Rote-Linsen-Dal', '']) {
    const index = placeholderColorIndex(title);
    assert.ok(index >= 0 && index < 10);
  }
});
