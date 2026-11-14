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

test('backTargetFor folgt der Herkunft, navigateBack geht echt zurück nur wenn der Vorgänger das Ziel ist', async () => {
  const { backTargetFor, navigateBack, recordHistoryEntry } = await import('../services/backNavigation.ts');
  assert.equal(backTargetFor('/recipe/1', { from: 'favorites' }), '/tabs/favorites');
  assert.equal(backTargetFor('/recipe/1', { fromCategory: 'Frühstück' }), '/category/Fr%C3%BChst%C3%BCck');
  assert.equal(backTargetFor('/tabs/categories', null), '/tabs/categories');

  const calls = [];
  const navigate = (...args) => calls.push(args);
  recordHistoryEntry(4, '/category/Fr%C3%BChst%C3%BCck');
  recordHistoryEntry(5, '/recipe/1');
  navigateBack(navigate, '/category/Fr%C3%BChst%C3%BCck', 5);
  navigateBack(navigate, '/tabs/favorites', 5);
  navigateBack(navigate, '/tabs/categories', 0);
  assert.deepEqual(calls, [[-1], ['/tabs/favorites', { replace: true }], ['/tabs/categories', { replace: true }]]);
});
