import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShoppingItemKey,
  buildLegacyShoppingItemKeys,
  formatAmounts,
  groupByRecipe,
  groupBySection,
  mergeRows,
  parseQuickAdd,
  sectionOf,
  shareText,
  suggest,
  sumAmounts,
} from './shoppingListView.ts';

const item = (overrides) => ({
  _id: overrides._id,
  name: overrides.name,
  amount: overrides.amount,
  key: overrides.key ?? overrides._id,
  checked: overrides.checked ?? false,
  createdAt: overrides.createdAt ?? 0,
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

test('sectionOf matches short keywords only as whole words', () => {
  assert.equal(sectionOf('Basmatireis').key, 'dry-goods');
  assert.equal(sectionOf('Weizenmehl').key, 'baking');
  assert.equal(sectionOf('Eier').key, 'dairy-eggs');
  assert.equal(sectionOf('Bio Ei').key, 'dairy-eggs');
  assert.equal(sectionOf('Olivenöl').key, 'spices-oils');
  assert.equal(sectionOf('TK Erbsen').key, 'frozen');
  assert.equal(sectionOf('Guanciale').key, 'meat-fish');
  assert.equal(sectionOf('Irgendwas').key, 'other');
});

test('sumAmounts adds equal units and keeps the rest', () => {
  assert.equal(sumAmounts(['3', '2']), '5');
  assert.equal(sumAmounts(['1 l', '300 ml']), '1,3 l');
  assert.equal(sumAmounts(['600 g', '500 g']), '1,1 kg');
  assert.equal(sumAmounts(['3 EL', '1 el']), '4 EL');
  assert.equal(sumAmounts(['200 g', '1 Bund']), '200 g + 1 Bund');
  assert.equal(sumAmounts(['etwas', '2']), '2 + etwas');
  assert.equal(sumAmounts(['½', '½']), '1');
  assert.equal(sumAmounts(['1 Kopf']), '1 Kopf');
  assert.equal(sumAmounts(['1/2 l', '250 ml']), '750 ml');
  assert.equal(sumAmounts(['1 ½ TL', '1 TL']), '2,5 TL');
  assert.equal(sumAmounts(['200g', '100 g']), '300 g');
  assert.equal(sumAmounts(['2-3 EL', '1 EL']), '1 EL + 2-3 EL', 'ranges are never added up');
  assert.equal(sumAmounts(['ca. 200 g', '100 g']), '100 g + ca. 200 g');
  assert.equal(sumAmounts([]), '');
});

test('mergeRows merges the same ingredient across recipes', () => {
  const rows = mergeRows([
    item({ _id: '1', name: 'Eier', amount: '3', recipeId: 'carbonara', checked: true }),
    item({ _id: '2', name: 'eier ', amount: '2', recipeId: 'pancakes' }),
    item({ _id: '3', name: 'Brot' }),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].ids, ['1', '2']);
  assert.deepEqual(rows[0].recipeIds, ['carbonara', 'pancakes']);
  assert.equal(rows[0].checked, false, 'only checked when every merged entry is checked');
  assert.equal(formatAmounts(rows[0]), '5');
  assert.equal(formatAmounts(rows[1]), '');
});

test('groupBySection follows the supermarket order and drops empty sections', () => {
  const groups = groupBySection(mergeRows([
    item({ _id: '1', name: 'Milch' }),
    item({ _id: '2', name: 'Tomaten' }),
    item({ _id: '3', name: 'Spaghetti' }),
    item({ _id: '4', name: 'Brötchen' }),
    item({ _id: '5', name: 'Grillanzünder' }),
  ]));
  assert.deepEqual(groups.map((g) => g.key), ['produce', 'bakery', 'dairy-eggs', 'dry-goods', 'other']);
});

test('groupByRecipe sorts by title, keeps legacy titles and puts own entries last', () => {
  const groups = groupByRecipe([
    item({ _id: '1', name: 'Salz' }),
    item({ _id: '2', name: 'Reis', recipeId: 'risotto', recipeTitle: 'Risotto' }),
    item({ _id: '3', name: 'Mehl', recipeId: 'broetchen', recipeTitle: 'Brötchen' }),
    item({ _id: '4', name: 'Parmesan', recipeTitle: 'Risotto alt' }),
  ]);
  assert.deepEqual(groups.map((g) => g.title), ['Brötchen', 'Risotto', 'Risotto alt', 'Eigene Einträge']);
});

test('parseQuickAdd splits amount, unit and name', () => {
  assert.deepEqual(parseQuickAdd('2 Eier'), { amount: '2', name: 'Eier' });
  assert.deepEqual(parseQuickAdd('500g Mehl'), { amount: '500 g', name: 'Mehl' });
  assert.deepEqual(parseQuickAdd('1,5 l  Milch'), { amount: '1,5 l', name: 'Milch' });
  assert.deepEqual(parseQuickAdd('3 rote Zwiebeln'), { amount: '3', name: 'rote Zwiebeln' });
  assert.deepEqual(parseQuickAdd(' Brot '), { name: 'Brot' });
  assert.deepEqual(parseQuickAdd('7'), { name: '7' });
  assert.deepEqual(parseQuickAdd('1/2 l Milch'), { amount: '1/2 l', name: 'Milch' });
  assert.deepEqual(parseQuickAdd('2-3 Tomaten'), { amount: '2-3', name: 'Tomaten' });
  assert.deepEqual(parseQuickAdd('1 1/2 Tassen Mehl'), { amount: '1 1/2 Tassen', name: 'Mehl' });
  assert.deepEqual(parseQuickAdd('2 Zehen Knoblauch'), { amount: '2 Zehen', name: 'Knoblauch' });
  assert.deepEqual(parseQuickAdd('2er Pack Butter'), { name: '2er Pack Butter' });
  assert.equal(parseQuickAdd('   '), null);
});

test('suggest offers checked and recent items, never open ones', () => {
  const rows = mergeRows([
    item({ _id: '1', name: 'Eier', checked: true }),
    item({ _id: '2', name: 'Butter' }),
  ]);
  assert.deepEqual(suggest('', ['Butter', 'Bananen', 'eier'], rows), ['Eier', 'Bananen']);
  assert.deepEqual(suggest('ba', ['Bananen', 'Basilikum', 'Butter'], rows), ['Bananen', 'Basilikum']);
  assert.deepEqual(suggest('zwiebeln', ['Rote Zwiebeln'], rows), ['Rote Zwiebeln']);
  assert.deepEqual(suggest('Bananen', ['Bananen'], rows), [], 'no suggestion for what is already typed');
});

test('shareText lists only open entries by section', () => {
  const text = shareText(mergeRows([
    item({ _id: '1', name: 'Tomaten', amount: '500 g' }),
    item({ _id: '2', name: 'Milch', checked: true }),
  ]));
  assert.equal(text, 'Einkaufsliste\n\n🥦 Obst & Gemüse\n• 500 g Tomaten');
});
