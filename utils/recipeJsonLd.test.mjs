import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanText, extractRecipeFromHtml } from './recipeJsonLd.ts';

const page = (jsonLd, head = '') =>
  `<html><head>${head}<script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;

test('liest ein Rezept aus @graph mit Abschnitten und Bildobjekt', () => {
  const recipe = extractRecipeFromHtml(page({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: 'Seite' },
      {
        '@type': ['Recipe'],
        name: 'Shakshuka &amp; Feta',
        image: [{ '@type': 'ImageObject', url: 'https://example.com/shakshuka.jpg' }],
        recipeYield: ['2', '2 Portionen'],
        recipeIngredient: ['4 Eier', '1 Dose Tomaten'],
        recipeInstructions: [
          { '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ '@type': 'HowToStep', text: '1. Tomaten <b>köcheln</b>.' }] },
          { '@type': 'HowToStep', text: 'Eier hineingeben.' },
        ],
      },
    ],
  }));
  assert.ok(recipe);
  assert.equal(recipe.title, 'Shakshuka & Feta');
  assert.equal(recipe.image, 'https://example.com/shakshuka.jpg');
  assert.match(recipe.content, /- 4 Eier/);
  assert.match(recipe.content, /\*\*Sauce\*\*\n1\. Tomaten köcheln\.\n2\. Eier hineingeben\./);
});

test('ohne Zutaten oder Schritte gibt es kein Rezept, og:image dient als Bild-Fallback', () => {
  assert.equal(extractRecipeFromHtml(page({ '@type': 'Recipe', name: 'Leer', recipeIngredient: [] })), null);
  assert.equal(extractRecipeFromHtml('<html><body>kein Markup</body></html>'), null);
  const recipe = extractRecipeFromHtml(page(
    { '@type': 'Recipe', name: 'Brot', recipeIngredient: ['Mehl'], recipeInstructions: 'Kneten.\nBacken.' },
    '<meta property="og:image" content="https://example.com/brot.jpg">',
  ));
  assert.equal(recipe?.image, 'https://example.com/brot.jpg');
  assert.match(recipe?.content ?? '', /1\. Kneten\.\n2\. Backen\./);
});

test('cleanText löst Entities auf und entfernt Tags', () => {
  assert.equal(cleanText('Gr&ouml;&szlig;e&nbsp;M <br/>&#8211; &#x2013; <i>fein</i>, &Uuml;bersicht &bogus;'), 'Größe M – – fein, Übersicht &bogus;');
});
