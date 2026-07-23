import test from 'node:test';
import assert from 'node:assert/strict';
import { getUserErrorMessage, stripErrorNoise } from './userErrors.ts';

test('strips Convex wrapper noise before matching the actual auth error', () => {
  const error = new Error(
    '[CONVEX A(auth:signIn)] [Request ID: abc123] Server Error: Uncaught Error: InvalidSecret'
  );

  assert.equal(stripErrorNoise(error), 'InvalidSecret');
  assert.equal(getUserErrorMessage(error, 'auth-signin'), 'E-Mail oder Passwort ist falsch.');
});

test('maps duplicate signup/account errors to a sign-in hint', () => {
  const error = new Error('Server Error: Uncaught Error: account already exists');

  assert.equal(
    getUserErrorMessage(error, 'auth-signup'),
    'Diese E-Mail ist bereits registriert. Möchtest du dich anmelden?'
  );
});

test('maps invalid or expired verification codes', () => {
  const error = new Error('Invalid verification code');

  assert.equal(
    getUserErrorMessage(error, 'auth-reset'),
    'Der Code ist ungültig oder abgelaufen. Fordere einen neuen an.'
  );
});

test('maps network failures independent of context', () => {
  assert.equal(
    getUserErrorMessage(new Error('Connection lost while action was in flight'), 'save'),
    'Keine Verbindung. Prüfe dein Internet und versuche es erneut.'
  );
});

test('maps structured backend errors embedded in noisy Convex messages', () => {
  const error = new Error(
    '[CONVEX A(instagram:scrapePost)] [Request ID: req] Server Error: Uncaught Error: {"type":"API_UNAVAILABLE","message":"Der Instagram-Service ist gerade nicht verfügbar."}'
  );

  assert.equal(
    getUserErrorMessage(error, 'import'),
    'Der Instagram-Service ist gerade nicht verfügbar.'
  );
});

test('falls back to context-specific German messages without leaking raw backend text', () => {
  assert.equal(
    getUserErrorMessage(new Error('Unexpected backend stack trace: foo.bar'), 'image'),
    'Das Bild konnte nicht verarbeitet werden. Bitte versuche es erneut.'
  );

  assert.equal(
    getUserErrorMessage(new Error('Unexpected backend stack trace: foo.bar'), 'save'),
    'Speichern hat nicht geklappt. Bitte versuche es erneut.'
  );
});
