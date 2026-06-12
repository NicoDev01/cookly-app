import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRecipeImageUrl } from '../convex/pollinationsHelper.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

const read = (path) => readFileSync(join(root, path), 'utf8');

test('Gemini credentials are not exposed through Vite or client source', () => {
  const files = [
    'components/AddRecipeModal.tsx',
    'components/addRecipeModal/aiScanRecipe.ts',
    'vite.config.ts',
    '.env.local',
    '.env.production',
    'README.md',
  ];

  for (const file of files) {
    const source = read(file);
    assert.equal(
      /VITE_GEMINI_API_KEY|process\.env\.API_KEY|process\.env\.GEMINI_API_KEY/.test(source),
      false,
      `${file} must not expose Gemini credentials to the Vite client bundle`,
    );
  }

  const clientSource = [
    read('components/AddRecipeModal.tsx'),
    read('components/addRecipeModal/aiScanRecipe.ts'),
  ].join('\n');

  assert.equal(
    /@google\/genai|createGeminiClient/.test(clientSource),
    false,
    'Gemini SDK/client creation must stay out of frontend modules',
  );
});

test('Pollinations recipe image URLs never include API keys', () => {
  const url = buildRecipeImageUrl('Spaghetti Bolognese', 12345, 'secret-key');

  assert.equal(url.includes('secret-key'), false);
  assert.equal(new URL(url).searchParams.has('key'), false);
});

test('native subscription page blocks Stripe purchase flows', () => {
  const source = read('pages/SubscribePage.tsx');

  assert.match(source, /Capacitor\.isNativePlatform\(\)/);
  assert.match(source, /nativeBillingUnavailable/);
  assert.match(source, /In-App-Kauf/);
});

test('subscription page treats missing subscription as free while user data loads', () => {
  const pageSource = read('pages/SubscribePage.tsx');
  const statusSource = read('utils/subscriptionStatus.ts');

  assert.doesNotMatch(pageSource, /currentUser\?\.subscription !== "free"/);
  assert.match(pageSource, /getSubscriptionViewState\(currentUser\)/);
  assert.match(statusSource, /currentUser === undefined/);
  assert.match(statusSource, /\?\? "free"/);
});

test('AI scan createRecipe calls only pass fields accepted by recipes.create', () => {
  const source = read('components/AddRecipeModal.tsx');

  assert.doesNotMatch(source, /isInWeeklyList\s*:/);
});

test('manual save limit checks do not depend on phantom form fields', () => {
  const source = read('components/AddRecipeModal.tsx');

  assert.doesNotMatch(source, /formData\.sourceUrl/);
  assert.match(source, /addModalImportUrl/);
});

test('category stats backfill is not triggered by an unreachable client condition', () => {
  const source = read('pages/CategoriesPage.tsx');

  assert.doesNotMatch(source, /backfillCategoryStats/);
  assert.doesNotMatch(source, /totalCount === 0/);
});

test('manual recipe defaults use a canonical category', () => {
  const source = [
    read('components/AddRecipeModal.tsx'),
    read('components/addRecipeModal/ManualRecipeForm.tsx'),
  ].join('\n');

  assert.doesNotMatch(source, /Hauptgericht/);
  assert.match(source, /Sonstiges/);
});

test('native back button has one Capacitor listener source and no legacy handler module', () => {
  assert.equal(existsSync(join(root, 'services/backButtonHandler.ts')), false);

  const shareTarget = read('pages/ShareTargetPage.tsx');
  const globalHook = read('hooks/useBackButton.ts');

  assert.doesNotMatch(shareTarget, /addListener\(['"]backButton['"]/);
  assert.match(shareTarget, /registerBackButtonOverride/);
  assert.match(globalHook, /addListener\(['"]backButton['"]/);
  assert.match(globalHook, /getActiveBackButtonOverride/);
});

test('TypeScript app config uses strict checking', () => {
  const source = read('tsconfig.app.json');

  assert.match(source, /"strict":\s*true/);
});

test('shopping mutations preserve ingredient amounts', () => {
  const source = read('convex/shopping.ts');

  assert.match(source, /amount:\s*args\.amount/);
});

test('ingredients optimistic update preserves ingredient amounts', () => {
  const source = read('components/Ingredients.tsx');

  assert.doesNotMatch(source, /amount:\s*undefined/);
  assert.match(source, /amount/);
});

test('Android manifest disallows cleartext traffic and legacy storage permissions', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');

  assert.doesNotMatch(manifest, /usesCleartextTraffic="true"/);
  assert.doesNotMatch(manifest, /READ_EXTERNAL_STORAGE/);
  assert.doesNotMatch(manifest, /WRITE_EXTERNAL_STORAGE/);
});

test('Apify tokens are sent through Authorization headers, not query strings', () => {
  for (const file of ['convex/instagram.ts', 'convex/facebook.ts']) {
    const source = read(file);
    assert.doesNotMatch(source, /[?&]token=\$\{APIFY_TOKEN\}/, `${file} must not put APIFY_TOKEN in URLs`);
    assert.match(source, /Authorization": `Bearer \$\{APIFY_TOKEN\}`/, `${file} must use bearer auth`);
  }
});

test('obsolete Clerk Convex config has been removed', () => {
  const configPath = join(root, 'convex.config.ts');
  if (!existsSync(configPath)) return;

  const source = readFileSync(configPath, 'utf8');
  assert.doesNotMatch(source, /CLERK_JWT_ISSUER_DOMAIN|clerk\.accounts\.dev|defineApp/);
});

test('index preconnect comments do not reference removed auth providers', () => {
  const source = read('index.html');

  assert.doesNotMatch(source, /Auth0|Clerk/);
});
