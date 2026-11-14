import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRecipeFromHtml } from './recipeJsonLd.ts';
import { buildFastRecipe, cleanTitle, splitIngredient } from './recipeFastPath.ts';

const page = (jsonLd, { lang = 'de', title = '' } = {}) =>
  `<html lang="${lang}"><head><title>${title}</title><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;

/** Aufbau wie bei Chefkoch (Nov. 2026): @graph, Autor als @id-Verweis, ein Abschnitt "Zubereitung". */
const chefkoch = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Person', '@id': 'https://www.chefkoch.de/user/1#author', name: 'Ostmann' },
    {
      '@type': 'Recipe',
      name: 'Klassische Lasagne von Ostmann',
      author: { '@id': 'https://www.chefkoch.de/user/1#author' },
      inLanguage: 'de-DE',
      recipeYield: ['4', '4 Portionen'],
      prepTime: 'PT15M',
      cookTime: 'PT1H25M',
      totalTime: 'PT1H40M',
      recipeCategory: 'Gemüse',
      keywords: 'Hauptspeise, Rind, Nudeln, Auflauf, Pasta, normal',
      recipeIngredient: ['500 g Hackfleisch, gemischtes', '300 g Lasagneplatte(n)', '2 Zehe/n Knoblauch', '1.5 TL Salz', 'Salz und Pfeffer'],
      recipeInstructions: [{
        '@type': 'HowToSection',
        name: 'Zubereitung',
        itemListElement: [
          { '@type': 'HowToStep', text: 'Hackfleisch in der Pfanne krümelig anbraten.' },
          { '@type': 'HowToStep', text: 'Backofen auf 180 °C vorheizen und alles schichten.' },
        ],
      }],
    },
  ],
};

const fastFrom = (jsonLd, options) => buildFastRecipe(extractRecipeFromHtml(page(jsonLd, options)).schema);

test('Chefkoch-Rezept geht ohne Gemini durch und wird sauber abgebildet', () => {
  const { recipe, issues } = fastFrom(chefkoch, { title: 'Klassische Lasagne von Ostmann | Chefkoch' });
  assert.deepEqual(issues, []);
  assert.equal(recipe.title, 'Klassische Lasagne');
  assert.equal(recipe.category, 'Pasta');
  assert.equal(recipe.prepTimeMinutes, 100);
  assert.equal(recipe.portions, 4);
  assert.equal(recipe.difficulty, 'Mittel');
  assert.deepEqual(recipe.ingredients, [
    { amount: '500 g', name: 'Hackfleisch, gemischtes' },
    { amount: '300 g', name: 'Lasagneplatten' },
    { amount: '2 Zehen', name: 'Knoblauch' },
    { amount: '1,5 TL', name: 'Salz' },
    { amount: '', name: 'Salz und Pfeffer' },
  ]);
  assert.deepEqual(recipe.instructions.map((step) => step.icon), ['skillet', 'oven_gen']);
});

test('Englische Seiten, unklare Kategorie und Fremd-Rezepte gehen an Gemini', () => {
  const english = fastFrom({ ...chefkoch['@graph'][1], name: 'Banana Bread', inLanguage: 'en-US' });
  assert.ok(english.issues.includes('not_german'));
  assert.ok(english.recipe, 'Ersatzrezept bleibt für den Fall, dass Gemini ausfällt');

  const unknown = fastFrom({ ...chefkoch['@graph'][1], name: 'Omas Allerlei', keywords: '', recipeCategory: '', recipeIngredient: ['1 Zwiebel', '2 Möhren'] });
  assert.deepEqual(unknown.issues, ['category_unknown']);
  assert.equal(unknown.recipe.category, 'Sonstiges');

  const foreign = fastFrom({ ...chefkoch['@graph'][1], name: 'White Lady' }, { title: 'Spaghetti Carbonara Rezept' });
  assert.deepEqual(foreign, { recipe: null, issues: ['title_mismatch'] });
});

test('Kategorie: Name vor Keywords, Zutaten als letzter Hinweis, keine Fehltreffer durch Wortteile', () => {
  const base = { ...chefkoch['@graph'][1], keywords: '', recipeCategory: '' };
  const category = (name, recipeIngredient = ['1 Zwiebel', '2 Möhren'], extra = {}) =>
    fastFrom({ ...base, name, recipeIngredient, ...extra }).recipe.category;
  assert.equal(category('Sauer-scharfe Kokossuppe mit Garnelen'), 'Suppe');
  assert.equal(category('Saftiger Schokoladenkuchen'), 'Backen');
  assert.equal(category('Gebratener Reis'), 'Beilage');
  assert.equal(category('Pfannkuchen'), 'Frühstück');
  assert.equal(category('Omas Topf', ['500 g Rindergulasch', '1 Zwiebel']), 'Fleisch');
  assert.equal(category('Omas Topf', ['1 EL Fischsauce', '2 Möhren', '1 Zwiebel'], { suitableForDiet: 'https://schema.org/VeganDiet' }), 'Vegan');
  assert.equal(category('Omas Topf', ['Petersilie, gehackt', '2 Möhren']), 'Sonstiges');
});

test('Zutaten: Mengen, Einheiten und Chefkoch-Mehrzahl', () => {
  assert.deepEqual(splitIngredient('1 kleine Zwiebel(n), rote'), { amount: '1', name: 'kleine Zwiebel, rote' });
  assert.deepEqual(splitIngredient('3 Zwiebel(n)'), { amount: '3', name: 'Zwiebeln' });
  assert.deepEqual(splitIngredient('0.5 Stange/n Zitronengras'), { amount: '0,5 Stange', name: 'Zitronengras' });
  assert.deepEqual(splitIngredient('1 gestr. TL Backpulver'), { amount: '1 gestr. TL', name: 'Backpulver' });
  assert.deepEqual(splitIngredient('1 ½ dl Wasser'), { amount: '1 ½ dl', name: 'Wasser' });
  assert.deepEqual(splitIngredient('etwas Öl'), { amount: 'etwas', name: 'Öl' });
  assert.deepEqual(splitIngredient('1 Dose Tomaten, geschälte (800 g)'), { amount: '1 Dose', name: 'Tomaten, geschälte (800 g)' });
});

test('Zwischenüberschriften, Seitenhinweise und Werbe-Titel werden bereinigt', () => {
  const { recipe } = fastFrom({
    ...chefkoch['@graph'][1],
    name: 'Klassisches Gulasch – zart, einfach & lecker',
    recipeIngredient: ['Für den Teig:', '500 g Rindergulasch', '2 Zwiebeln'],
    recipeInstructions: [
      { '@type': 'HowToSection', name: '*Hinweis: Schau dir das Rezept-Video an', itemListElement: [{ '@type': 'HowToStep', text: 'Fleisch anbraten.' }] },
      { '@type': 'HowToSection', name: 'Soße', itemListElement: [{ '@type': 'HowToStep', text: 'Mit Brühe ablöschen.' }] },
    ],
  });
  assert.equal(recipe.title, 'Klassisches Gulasch');
  assert.deepEqual(recipe.ingredients.map((item) => item.name), ['Rindergulasch', 'Zwiebeln']);
  assert.deepEqual(recipe.instructions.map((step) => step.text), ['Fleisch anbraten.', 'Soße: Mit Brühe ablöschen.']);
  assert.equal(cleanTitle('Türkische Linsensuppe: Rezept für das wärmende Gericht', ''), 'Türkische Linsensuppe');
  assert.equal(cleanTitle('Spaghetti Carbonara mit Sahne Rezept', ''), 'Spaghetti Carbonara mit Sahne');
  assert.equal(cleanTitle('Omas Rezept für Apfelkuchen', ''), 'Omas Rezept für Apfelkuchen');
});

test('Ein einzelner langer Textblock wird in Schritte zerlegt', () => {
  const block = 'Zwiebeln schälen und würfeln. '.repeat(10) + 'Alles in der Pfanne anbraten. '.repeat(10);
  const { recipe, issues } = fastFrom({ ...chefkoch['@graph'][1], recipeInstructions: block.trim() });
  assert.deepEqual(issues, []);
  assert.ok(recipe.instructions.length >= 2);
  assert.ok(recipe.instructions.every((step) => step.text.length <= 320));
});

test('Kaputte HTML-Nummern brechen den Import nicht ab', () => {
  const { recipe } = fastFrom({ ...chefkoch['@graph'][1], name: 'Klassische Lasagne &#99999999; &amp; mehr' });
  assert.equal(recipe.title, 'Klassische Lasagne & mehr');
});
