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
