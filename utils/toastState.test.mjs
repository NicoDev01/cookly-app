import test from 'node:test';
import assert from 'node:assert/strict';
import { createToastState } from './toastState.ts';

test('creates a generic error toast without navigation target', () => {
  assert.deepEqual(createToastState('Speichern hat nicht geklappt.', 'error'), {
    visible: true,
    recipeId: null,
    message: 'Speichern hat nicht geklappt.',
    title: 'Fehler',
    tone: 'error',
  });
});

test('creates the existing import toast as a success toast with recipe navigation target', () => {
  assert.deepEqual(createToastState('Tippe zum Ansehen', 'success', 'recipe-123'), {
    visible: true,
    recipeId: 'recipe-123',
    message: 'Tippe zum Ansehen',
    title: 'Rezept importiert',
    tone: 'success',
  });
});
