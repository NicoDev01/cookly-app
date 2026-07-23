import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('route and add-recipe Suspense boundaries render visible fallbacks', () => {
  assert.equal(existsSync('components/PageLoader.tsx'), true, 'PageLoader component is missing');

  const app = readFileSync('App.tsx', 'utf8');
  const tabs = readFileSync('components/TabsLayout.tsx', 'utf8');
  const recipe = readFileSync('pages/RecipePage.tsx', 'utf8');
  const recipeHero = readFileSync('components/RecipeHero.tsx', 'utf8');

  assert.equal(app.includes('<Suspense fallback={null}>'), false, 'App route Suspense still has null fallback');
  assert.equal(tabs.includes('<Suspense fallback={null}>'), false, 'TabsLayout Suspense still has null fallback');
  assert.equal(recipe.includes('<Suspense fallback={null}>'), false, 'RecipePage modal Suspense still has null fallback');
  assert.equal(recipeHero.includes('<Suspense fallback={null}>'), false, 'RecipeHero modal Suspense still has null fallback');

  assert.match(app, /fallback=\{<PageLoader/, 'App route Suspense should use PageLoader');
  assert.match(tabs, /fallback=\{<PageLoader/, 'TabsLayout route Suspense should use PageLoader');
  assert.match(tabs, /fallback=\{<ModalLoader/, 'TabsLayout modal Suspense should use ModalLoader');
  assert.match(recipe, /fallback=\{<ModalLoader/, 'RecipePage modal Suspense should use ModalLoader');
  assert.match(recipeHero, /fallback=\{<ModalLoader/, 'RecipeHero modal Suspense should use ModalLoader');
});

test('motion tokens and reduced-motion safeguards are globally defined', () => {
  const tailwind = readFileSync('tailwind.config.js', 'utf8');
  const css = readFileSync('index.css', 'utf8');

  assert.match(tailwind, /motion-snappy/, 'Tailwind motion-snappy token missing');
  assert.match(tailwind, /motion-smooth/, 'Tailwind motion-smooth token missing');
  assert.match(tailwind, /motion-cookly/, 'Tailwind motion easing token missing');

  assert.match(css, /--motion-snappy:\s*150ms/, 'CSS snappy motion variable missing');
  assert.match(css, /--motion-smooth:\s*300ms/, 'CSS smooth motion variable missing');
  assert.match(css, /--motion-ease:\s*cubic-bezier\(0\.2,\s*0,\s*0,\s*1\)/, 'CSS easing variable missing');
  assert.match(css, /prefers-reduced-motion:\s*reduce/, 'reduced motion media query missing');
  assert.match(css, /transition:\s*none\s*!important/, 'reduced motion should disable transitions');
});
