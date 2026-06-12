import test from 'node:test';
import assert from 'node:assert/strict';

import { getCategoryPreviewImages } from './categoryPreviewImages.ts';

test('category preview uses up to four recipe images', () => {
  const images = getCategoryPreviewImages(
    ['one.jpg', 'two.jpg', 'three.jpg', 'four.jpg', 'five.jpg'],
    'fallback.jpg'
  );

  assert.deepEqual(images, ['one.jpg', 'two.jpg', 'three.jpg', 'four.jpg']);
});

test('category preview ignores empty recipe images before applying limit', () => {
  const images = getCategoryPreviewImages(
    ['one.jpg', '', undefined, 'two.jpg', null, 'three.jpg'],
    'fallback.jpg'
  );

  assert.deepEqual(images, ['one.jpg', 'two.jpg', 'three.jpg']);
});

test('category preview falls back to category image only without recipe images', () => {
  const images = getCategoryPreviewImages([undefined, '', null], 'fallback.jpg');

  assert.deepEqual(images, ['fallback.jpg']);
});
