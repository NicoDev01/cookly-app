import assert from 'node:assert/strict';
import test from 'node:test';
import { isRetryableGeminiError } from './geminiRetry.ts';

const apiError = (code, status) => new Error(JSON.stringify({ error: { code, status, message: 'x' } }));

test('Überlastung wird wiederholt, aufgebrauchtes Guthaben (402) nicht', () => {
  assert.equal(isRetryableGeminiError(apiError(503, 'UNAVAILABLE')), true);
  assert.equal(isRetryableGeminiError(apiError(429, 'RESOURCE_EXHAUSTED')), true);
  assert.equal(isRetryableGeminiError(apiError(402, 'RESOURCE_EXHAUSTED')), false);
  assert.equal(isRetryableGeminiError(apiError(400, 'INVALID_ARGUMENT')), false);
});

test('Überlastung wechselt sofort zum Ersatzmodell, erst dort wird mit Wartezeit wiederholt', async () => {
  const { runWithGeminiModelFallback } = await import('./geminiRetry.ts');
  const calls = [];
  const result = await runWithGeminiModelFallback(['neu', 'alt'], async (model) => {
    calls.push(model);
    if (model === 'neu' || calls.length < 3) throw apiError(503, 'UNAVAILABLE');
    return 'ok';
  }, { delaysMs: [0, 0] });
  assert.equal(result, 'ok');
  assert.deepEqual(calls, ['neu', 'alt', 'alt']);

  const contentCalls = [];
  await assert.rejects(runWithGeminiModelFallback(['neu', 'alt'], async (model) => {
    contentCalls.push(model);
    throw apiError(400, 'INVALID_ARGUMENT');
  }, { delaysMs: [0] }));
  assert.deepEqual(contentCalls, ['neu'], 'inhaltliche Fehler ohne Wechsel');
});
