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

test('Überlastung wechselt sofort zum Ersatzmodell; sind alle überlastet, folgt nach Wartezeit eine neue Runde', async () => {
  const { runWithGeminiModelFallback } = await import('./geminiRetry.ts');
  const calls = [];
  const retries = [];
  const result = await runWithGeminiModelFallback(['neu', 'alt'], async (model) => {
    calls.push(model);
    if (model === 'neu' || calls.length < 3) throw apiError(503, 'UNAVAILABLE');
    return 'ok';
  }, { delaysMs: [0, 0], onRetry: ({ attempt }) => retries.push(attempt) });
  assert.equal(result, 'ok');
  assert.deepEqual(calls, ['neu', 'alt', 'neu', 'alt']);
  assert.deepEqual(retries, [1]);

  // Erholt sich das erste Modell, gewinnt es in der nächsten Runde (gesehen 2026-11-17).
  const recovered = [];
  const first = await runWithGeminiModelFallback(['neu', 'alt'], async (model) => {
    recovered.push(model);
    if (recovered.length <= 2) throw apiError(503, 'UNAVAILABLE');
    return model;
  }, { delaysMs: [0] });
  assert.equal(first, 'neu');
  assert.deepEqual(recovered, ['neu', 'alt', 'neu']);

  // Fehlendes Modell fällt aus der Rotation, alle Runden scheitern: letzter Fehler kommt durch.
  const gone = [];
  await assert.rejects(runWithGeminiModelFallback(['weg', 'alt'], async (model) => {
    gone.push(model);
    throw model === 'weg' ? apiError(404, 'NOT_FOUND') : apiError(503, 'UNAVAILABLE');
  }, { delaysMs: [0, 0] }), /503/);
  assert.deepEqual(gone, ['weg', 'alt', 'alt', 'alt']);

  const contentCalls = [];
  await assert.rejects(runWithGeminiModelFallback(['neu', 'alt'], async (model) => {
    contentCalls.push(model);
    throw apiError(400, 'INVALID_ARGUMENT');
  }, { delaysMs: [0] }));
  assert.deepEqual(contentCalls, ['neu'], 'inhaltliche Fehler ohne Wechsel');
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Simuliert eine Gemini-Anfrage: antwortet nach `ms` oder scheitert, reagiert auf Abbruch.
const fakeCall = (ms, result, signals) => (signal) => {
  signals?.push(signal);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => (result instanceof Error ? reject(result) : resolve(result)), ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
  });
};

test('Hedge: schnelle Antwort startet keine zweite Anfrage', async () => {
  const { runHedged } = await import('./geminiRetry.ts');
  let hedges = 0;
  const calls = [];
  const result = await runHedged((signal) => { calls.push(1); return fakeCall(5, 'ok')(signal); }, 50, () => hedges++);
  await sleep(60);
  assert.equal(result, 'ok');
  assert.equal(calls.length, 1);
  assert.equal(hedges, 0);
});

test('Hedge: langsame erste Anfrage, die zweite gewinnt und die erste wird abgebrochen', async () => {
  const { runHedged } = await import('./geminiRetry.ts');
  const signals = [];
  const durations = [300, 10];
  let hedges = 0;
  const started = Date.now();
  const result = await runHedged((signal) => fakeCall(durations[signals.length], `antwort${signals.length + 1}`, signals)(signal), 20, () => hedges++);
  assert.equal(result, 'antwort2');
  assert.equal(hedges, 1);
  assert.ok(Date.now() - started < 200, 'wartet nicht auf die langsame Anfrage');
  assert.equal(signals[0].aborted, true);
});

test('Hedge: früher Fehler geht sofort weiter, ohne Parallelstart', async () => {
  const { runHedged } = await import('./geminiRetry.ts');
  let hedges = 0;
  await assert.rejects(runHedged(fakeCall(5, apiError(503, 'UNAVAILABLE')), 50, () => hedges++), /503/);
  await sleep(60);
  assert.equal(hedges, 0);
});

test('Hedge: erste scheitert nach dem Parallelstart, die zweite rettet; scheitern beide, kommt der erste Fehler', async () => {
  const { runHedged } = await import('./geminiRetry.ts');
  let n = 0;
  const rescued = await runHedged((signal) => (n++ === 0 ? fakeCall(40, new Error('erste kaputt')) : fakeCall(30, 'gerettet'))(signal), 10);
  assert.equal(rescued, 'gerettet');

  let m = 0;
  await assert.rejects(
    runHedged((signal) => (m++ === 0 ? fakeCall(30, new Error('erster Fehler')) : fakeCall(40, new Error('zweiter Fehler')))(signal), 10),
    /erster Fehler/,
  );
});

test('Modell-Fallback reicht Hedge und Abbruchsignal an die Anfrage durch', async () => {
  const { runWithGeminiModelFallback } = await import('./geminiRetry.ts');
  const hedged = [];
  const seen = [];
  const result = await runWithGeminiModelFallback(['schnell'], (model, signal) => {
    seen.push(signal instanceof AbortSignal);
    return fakeCall(seen.length === 1 ? 300 : 5, `${model}${seen.length}`)(signal);
  }, { delaysMs: [], hedgeAfterMs: 20, onHedge: ({ model }) => hedged.push(model) });
  assert.equal(result, 'schnell2');
  assert.deepEqual(hedged, ['schnell']);
  assert.deepEqual(seen, [true, true]);
});
