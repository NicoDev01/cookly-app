import test from 'node:test';
import assert from 'node:assert/strict';

import { pickRecipeImage, sizedImageUrl } from './imageUrl.ts';

const placeholder = 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=2626&auto=format&fit=crop';

test('sizedImageUrl requests Unsplash images at the displayed size', () => {
  assert.equal(new URL(sizedImageUrl(placeholder, 56, 3)).searchParams.get('w'), '200');
  assert.equal(new URL(sizedImageUrl(placeholder, 170, 3)).searchParams.get('w'), '600');
  assert.equal(new URL(sizedImageUrl(placeholder, 1024, 2)).searchParams.get('w'), '1600');
  assert.equal(new URL(sizedImageUrl(placeholder, 56, 3)).searchParams.get('q'), '80');
});

test('sizedImageUrl leaves other images untouched', () => {
  const storage = 'https://patient-swan-852.convex.cloud/api/storage/abc';
  assert.equal(sizedImageUrl(storage, 56, 3), storage);
  assert.equal(sizedImageUrl(placeholder, 0, 3), placeholder);
});

test('pickRecipeImage uses the thumbnail only where it stays sharp', () => {
  assert.equal(pickRecipeImage('orig', 'thumb', 64, 3), 'thumb');
  assert.equal(pickRecipeImage('orig', 'thumb', 340, 3), 'orig', 'full-width cards keep the original');
  assert.equal(pickRecipeImage('orig', undefined, 64, 3), 'orig');
  assert.equal(pickRecipeImage('orig', 'thumb', 0, 3), 'orig', 'unknown size keeps the original');
});
