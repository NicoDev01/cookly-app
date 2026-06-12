import test from 'node:test';
import assert from 'node:assert/strict';

import { getPasswordSignInErrorMessage } from './authErrors.ts';

test('maps invalid account ids to a neutral credential error', () => {
  const error = new Error('[CONVEX A(auth:signIn)] Server Error\nUncaught Error: InvalidAccountId');

  assert.equal(getPasswordSignInErrorMessage(error), 'E-Mail oder Passwort ist falsch.');
});

test('maps invalid passwords to the same neutral credential error', () => {
  const error = new Error('InvalidSecret');

  assert.equal(getPasswordSignInErrorMessage(error), 'E-Mail oder Passwort ist falsch.');
});

test('maps sign-in rate limiting to an actionable message', () => {
  const error = new Error('TooManyFailedAttempts');

  assert.equal(
    getPasswordSignInErrorMessage(error),
    'Zu viele fehlgeschlagene Anmeldeversuche. Bitte warte kurz und versuche es erneut.',
  );
});

test('uses a generic login message for unknown sign-in failures', () => {
  assert.equal(
    getPasswordSignInErrorMessage(new Error('Unexpected backend failure')),
    'Anmeldung fehlgeschlagen. Bitte versuche es erneut.',
  );
});
