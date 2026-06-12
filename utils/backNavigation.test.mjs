import test from 'node:test';
import assert from 'node:assert/strict';

import { getBackTarget } from '../services/backNavigation.ts';

test('getBackTarget returns EXIT only for the app root', () => {
  assert.equal(getBackTarget('/tabs/categories'), 'EXIT');
  assert.equal(getBackTarget('/'), 'EXIT');
});

test('getBackTarget routes subscribe back to profile', () => {
  assert.equal(getBackTarget('/tabs/subscribe'), '/tabs/profile');
});

test('getBackTarget routes secondary tabs back to categories', () => {
  assert.equal(getBackTarget('/tabs/favorites'), '/tabs/categories');
  assert.equal(getBackTarget('/tabs/weekly'), '/tabs/categories');
  assert.equal(getBackTarget('/tabs/shopping'), '/tabs/categories');
  assert.equal(getBackTarget('/tabs/profile'), '/tabs/categories');
});
