import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAiScanErrorMessage,
  getGeminiApiErrorInfo,
  runWithGeminiRetry,
} from '../../utils/geminiRetry.ts';

test('detects Gemini 503 overload errors from SDK JSON messages', () => {
  const error = new Error(
    'Fehler bei der KI-Analyse: {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
  );

  assert.deepEqual(getGeminiApiErrorInfo(error), {
    code: 503,
    status: 'UNAVAILABLE',
    message: 'This model is currently experiencing high demand.',
  });
});

test('retries transient Gemini overload errors before succeeding', async () => {
  let calls = 0;

  const result = await runWithGeminiRetry(
    async () => {
      calls++;
      if (calls < 3) {
        throw new Error('{"error":{"code":503,"message":"overloaded","status":"UNAVAILABLE"}}');
      }
      return 'ok';
    },
    { delaysMs: [0, 0] },
  );

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('does not retry non-transient Gemini errors', async () => {
  let calls = 0;

  await assert.rejects(
    () =>
      runWithGeminiRetry(
        async () => {
          calls++;
          throw new Error('{"error":{"code":400,"message":"bad request","status":"INVALID_ARGUMENT"}}');
        },
        { delaysMs: [0, 0] },
      ),
    /bad request/,
  );

  assert.equal(calls, 1);
});

test('maps exhausted Gemini capacity errors to an actionable user message', () => {
  const error = new Error('{"error":{"code":503,"message":"overloaded","status":"UNAVAILABLE"}}');

  assert.equal(
    getAiScanErrorMessage(error),
    'Die KI ist gerade stark ausgelastet. Wir haben es mehrfach versucht. Bitte probiere es in ein paar Minuten erneut.',
  );
});
