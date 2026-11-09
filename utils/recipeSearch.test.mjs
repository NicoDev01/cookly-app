import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRecipe, normalizeSearchText, parseSearchQuery, searchRecipes } from './recipeSearch.ts';

const recipe = (title, ...ingredients) => ({ title, category: 'Hauptgericht', ingredients: ingredients.map((name) => ({ name })) });

const RECIPES = [
  recipe('Zucchini-Puffer', 'Zucchini', 'Eier', 'Mehl', 'Feta'),
  recipe('Tomatensuppe', 'Dosentomaten', 'Zwiebeln', 'Olivenöl'),
  recipe('Pasta mit Feta', 'Spaghetti', 'Kirschtomaten', 'Feta'),
  { ...recipe('Rührei', 'Eier', 'Butter', 'Schnittlauch'), category: 'Frühstück' },
  recipe('Linsen-Eintopf', 'Linsen', 'Karotten', 'Kartoffeln'),
  recipe('Wildreis-Bowl', 'Basmatireis', 'Gurke'),
  recipe('Preiselbeer-Kompott', 'Preiselbeeren', 'Zucker'),
  recipe('Käsespätzle', 'Spätzle', 'Bergkäse', 'Zwiebel (rot)'),
];
const titles = (query) => searchRecipes(RECIPES, query).hits.map((entry) => entry.recipe.title);

test('normalizes umlauts and accents', () => {
  assert.equal(normalizeSearchText('Käse Crème Fraîche Grüße'), 'kaese creme fraiche gruesse');
});

test('drops filler words but keeps the query if nothing else is left', () => {
  assert.deepEqual(parseSearchQuery('Nudeln mit Tomate'), ['nudeln', 'tomate']);
  assert.deepEqual(parseSearchQuery('  mit  '), ['mit']);
  assert.deepEqual(parseSearchQuery('Feta feta'), ['feta']);
});

test('finds recipes by title and by ingredient, title hits first', () => {
  assert.deepEqual(titles('feta'), ['Pasta mit Feta', 'Zucchini-Puffer']);
  assert.deepEqual(titles('zucchini'), ['Zucchini-Puffer']);
});

test('every word must match title or an ingredient', () => {
  assert.deepEqual(titles('tomate feta'), ['Pasta mit Feta']);
  assert.deepEqual(titles('zwiebel eier'), []);
});

test('plural, compound and umlaut-free input match', () => {
  assert.deepEqual(titles('tomaten'), ['Tomatensuppe', 'Pasta mit Feta']);
  assert.deepEqual(titles('Zwiebel'), ['Tomatensuppe', 'Käsespätzle']);
  assert.deepEqual(titles('kaese'), ['Käsespätzle', 'Zucchini-Puffer', 'Pasta mit Feta']);
  assert.deepEqual(titles('reis'), ['Wildreis-Bowl']);
});

test('aliases: pasta finds spaghetti', () => {
  const match = matchRecipe(parseSearchQuery('nudeln'), RECIPES[2]);
  assert.deepEqual(match?.matchedIngredients, ['Spaghetti']);
});

test('short words do not match unrelated ingredients', () => {
  // "ei" trifft Eier, aber weder "Preiselbeeren" noch "Eintopf" über Zutaten.
  assert.deepEqual(titles('ei').sort(), ['Linsen-Eintopf', 'Rührei', 'Zucchini-Puffer'].sort());
  assert.equal(matchRecipe(['ei'], recipe('Salat', 'Eisbergsalat')), null);
});

test('reports only ingredients that are not already in the title', () => {
  const [pasta] = searchRecipes(RECIPES, 'pasta kirschtomaten').hits;
  assert.equal(pasta.recipe.title, 'Pasta mit Feta');
  assert.deepEqual(pasta.matchedIngredients, ['Kirschtomaten']);
  const [puffer] = searchRecipes(RECIPES, 'zucchini').hits;
  assert.deepEqual(puffer.matchedIngredients, []);
  // Klammer-Notizen zählen nicht und erscheinen nicht im Namen.
  assert.deepEqual(titles('rot'), []);
  const [spaetzle] = searchRecipes(RECIPES, 'spätzle zwiebel').hits;
  assert.deepEqual(spaetzle.matchedIngredients, ['Zwiebel']);
});

test('category names are searchable, combined with ingredients', () => {
  assert.deepEqual(titles('frühstück'), ['Rührei']);
  assert.deepEqual(titles('fruehstueck butter'), ['Rührei']);
});

test('typos fall back to similar results, marked as approximate', () => {
  const result = searchRecipes(RECIPES, 'Tomtae');
  assert.equal(result.approximate, true);
  assert.deepEqual(result.hits.map((hit) => hit.recipe.title), ['Tomatensuppe', 'Pasta mit Feta']);
  assert.deepEqual(titles('zuchini'), ['Zucchini-Puffer']);
  // Genaue Treffer gehen vor: "feta" sucht nicht zusätzlich nach "Fett".
  assert.equal(searchRecipes(RECIPES, 'feta').approximate, false);
});

test('without any hit, names the words that occur nowhere, as typed', () => {
  assert.deepEqual(searchRecipes(RECIPES, 'Zucchini Trüffel'), { hits: [], approximate: false, unmatchedTerms: ['Trüffel'] });
  // Beide Wörter gibt es, nur nicht im selben Rezept.
  assert.deepEqual(searchRecipes(RECIPES, 'Linsen Feta').unmatchedTerms, []);
  // Füllwörter werden nie als "kommt nicht vor" gemeldet.
  assert.deepEqual(searchRecipes(RECIPES, 'Safran mit Zucchini').unmatchedTerms, ['Safran']);
});

test('empty query finds nothing', () => {
  assert.deepEqual(searchRecipes(RECIPES, '   '), { hits: [], approximate: false, unmatchedTerms: [] });
  assert.deepEqual(searchRecipes(RECIPES, '!!!').hits, []);
});
