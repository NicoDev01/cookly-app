import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAVORITES_VIEW_MODES,
  getNextFavoritesViewMode,
  parseFavoritesViewMode,
} from './favoritesViewMode.ts';

test('favorites view mode accepts only supported persisted values', () => {
  assert.equal(parseFavoritesViewMode('large'), FAVORITES_VIEW_MODES.large);
  assert.equal(parseFavoritesViewMode('compact'), FAVORITES_VIEW_MODES.compact);
  assert.equal(parseFavoritesViewMode('invalid'), FAVORITES_VIEW_MODES.large);
  assert.equal(parseFavoritesViewMode(null), FAVORITES_VIEW_MODES.large);
});

test('favorites view mode toggles between large and compact', () => {
  assert.equal(getNextFavoritesViewMode('large'), FAVORITES_VIEW_MODES.compact);
  assert.equal(getNextFavoritesViewMode('compact'), FAVORITES_VIEW_MODES.large);
});
