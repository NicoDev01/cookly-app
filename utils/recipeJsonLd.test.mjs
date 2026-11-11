import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanText, extractPageText, extractRecipeFromHtml } from './recipeJsonLd.ts';

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

test('extractPageText liest Rezeptseiten ohne JSON-LD und ignoriert Seiten ohne Rezept', () => {
  const filler = 'Ein cremiges Pastagericht mit Pilzen und Spinat, in 20 Minuten fertig und komplett pflanzlich. '.repeat(4);
  const html = `<html><head><title>Pilz-Pasta</title><meta property="og:image" content="https://x.de/a.jpg"></head><body>
    <nav>Menü</nav><script>var x = 1;</script>
    <div class="wprm"><h2>Pilz-Pasta</h2><p>${filler}</p><h3>Zutaten</h3><ul><li>250 g Pasta</li><li>300 g Champignons</li></ul>
    <h3>Anleitung</h3><ol><li>Pasta kochen.</li><li>Pilze anbraten.</li></ol></div></body></html>`;
  const page = extractPageText(html);
  assert.equal(page.title, 'Pilz-Pasta');
  assert.equal(page.image, 'https://x.de/a.jpg');
  assert.match(page.content, /250 g Pasta\n300 g Champignons/);
  assert.doesNotMatch(page.content, /var x|Menü/);
  assert.equal(extractPageText(`<html><body><p>${filler} Bitte akzeptiere Cookies.</p></body></html>`), null);
});

test('extractPageText nimmt ohne og:image das Rezeptbild aus dem Inhalt in voller Größe', () => {
  const filler = 'Ein cremiges Pastagericht mit Pilzen und Spinat, in 20 Minuten fertig und komplett pflanzlich. '.repeat(4);
  const html = `<html><head><title>Pasta</title></head><body><img src="https://x.de/logo.png" width="300">
    <div class="wprm-recipe-image wprm-block-image-rounded"><img width="250" src="https://x.de/wp-content/uploads/pasta-360x361.jpg"></div>
    <p>${filler}</p><h3>Zutaten</h3><ul><li>250 g Pasta</li></ul><h3>Anleitung</h3><ol><li>Kochen.</li></ol></body></html>`;
  assert.equal(extractPageText(html).image, 'https://x.de/wp-content/uploads/pasta.jpg');
  const withSrcset = html.replace('src="https://x.de/wp-content/uploads/pasta-360x361.jpg"',
    'src="https://x.de/a-300x300.jpg" srcset="https://x.de/a-300x300.jpg 300w, https://x.de/a-1024x1024.jpg 1024w, https://x.de/a.jpg 4000w"');
  assert.equal(extractPageText(withSrcset).image, 'https://x.de/a-1024x1024.jpg');
});
