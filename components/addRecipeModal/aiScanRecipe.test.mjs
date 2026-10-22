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

test('falls back to the next Gemini model after the primary stays overloaded', async () => {
  const { runWithGeminiModelFallback } = await import('../../utils/geminiRetry.ts');
  const calls = [];
  const fallbacks = [];
  const result = await runWithGeminiModelFallback(['primary', 'backup'], async (model) => {
    calls.push(model);
    if (model === 'primary') throw new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}');
    return `ok:${model}`;
  }, { delaysMs: [0], onFallback: ({ from, to }) => fallbacks.push(`${from}->${to}`) });

  assert.equal(result, 'ok:backup');
  assert.deepEqual(calls, ['primary', 'primary', 'backup']);
  assert.deepEqual(fallbacks, ['primary->backup']);
});

test('falls back when the primary Gemini model no longer exists', async () => {
  const { runWithGeminiModelFallback } = await import('../../utils/geminiRetry.ts');
  const result = await runWithGeminiModelFallback(['gone', 'backup'], async (model) => {
    if (model === 'gone') throw new Error('{"error":{"code":404,"status":"NOT_FOUND"}}');
    return model;
  }, { delaysMs: [0] });
  assert.equal(result, 'backup');
});

test('content errors do not trigger a model fallback', async () => {
  const { runWithGeminiModelFallback } = await import('../../utils/geminiRetry.ts');
  const calls = [];
  await assert.rejects(
    runWithGeminiModelFallback(['primary', 'backup'], async (model) => {
      calls.push(model);
      throw new Error('{"error":{"code":400,"status":"INVALID_ARGUMENT"}}');
    }, { delaysMs: [0] }),
    /INVALID_ARGUMENT/,
  );
  assert.deepEqual(calls, ['primary']);
});
