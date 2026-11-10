import assert from "node:assert/strict";
import test from "node:test";

import { ApifyRunError, runApifyActorUntilDone } from "../convex/lib/apifyRun.ts";

/** Fake-Apify: liefert pro Aufruf die nächste Antwort aus `script` und protokolliert die URLs. */
function fakeApify(script) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET" });
    if (String(url).endsWith("/abort")) return new Response("{}");
    const next = script.shift();
    if (!next) throw new Error(`unexpected call ${url}`);
    if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return { calls, fetchImpl };
}

const run = (status) => ({ body: { data: { id: "run1", status, defaultDatasetId: "ds1" } } });

test("wartet über mehrere Long-Polls, bis der Lauf fertig ist, statt abzubrechen", async () => {
  // Real (Nov. 2026): Instagram-Läufe brauchten 33–77 s; das alte 30-s-Timeout verwarf sie.
  const { calls, fetchImpl } = fakeApify([run("RUNNING"), run("RUNNING"), run("SUCCEEDED"), { body: [{ caption: "Pasta" }] }]);
  let clock = 0;
  const items = await runApifyActorUntilDone("apify~instagram-reel-scraper", { username: ["x"] }, {
    token: "t",
    deadlineAt: 90_000,
    fetchImpl,
    now: () => (clock += 20_000),
  });

  assert.deepEqual(items, [{ caption: "Pasta" }]);
  assert.match(calls[0].url, /\/acts\/apify~instagram-reel-scraper\/runs\?waitForFinish=\d+$/);
  assert.match(calls[1].url, /\/actor-runs\/run1\?waitForFinish=\d+$/);
  assert.match(calls.at(-1).url, /\/datasets\/ds1\/items\?clean=true$/);
  assert.ok(!calls.some((call) => call.url.endsWith("/abort")));
});

test("bricht den Lauf bei Apify ab, wenn die Deadline erreicht ist", async () => {
  const { calls, fetchImpl } = fakeApify([run("RUNNING")]);
  let clock = 0;
  await assert.rejects(
    runApifyActorUntilDone("a", {}, { token: "t", deadlineAt: 10_000, fetchImpl, now: () => (clock += 6_000) }),
    (error) => error instanceof ApifyRunError && error.reason === "deadline",
  );
  assert.ok(calls.some((call) => call.url.endsWith("/actor-runs/run1/abort") && call.method === "POST"));
});

test("meldet fehlgeschlagene Läufe ohne Dataset-Abruf", async () => {
  const { calls, fetchImpl } = fakeApify([run("FAILED")]);
  await assert.rejects(
    runApifyActorUntilDone("a", {}, { token: "t", deadlineAt: Date.now() + 60_000, fetchImpl }),
    (error) => error instanceof ApifyRunError && error.reason === "run_failed",
  );
  assert.equal(calls.length, 1);
});

test("Abbruch von außen stoppt auch den Apify-Lauf", async () => {
  const controller = new AbortController();
  const { calls, fetchImpl } = fakeApify([run("RUNNING"), run("RUNNING")]);
  const wrapped = async (url, init) => {
    if (String(url).includes("/actor-runs/run1?")) controller.abort();
    return fetchImpl(url, init);
  };
  await assert.rejects(
    runApifyActorUntilDone("a", {}, { token: "t", deadlineAt: Date.now() + 60_000, fetchImpl: wrapped, signal: controller.signal }),
    (error) => error instanceof ApifyRunError && error.reason === "cancelled",
  );
  assert.ok(calls.some((call) => call.url.endsWith("/actor-runs/run1/abort")));
});

// --- Versuchsplan mit parallelem Zweitversuch --------------------------------

import { runAttemptPlan } from "../convex/lib/attemptPlan.ts";

/** Manuell auslösbare Verzögerung statt echter Timer. */
function manualDelay() {
  const fire = [];
  return {
    fire: () => fire.splice(0).forEach((resolve) => resolve()),
    delay: () => ({ promise: new Promise((resolve) => fire.push(resolve)), cancel() {} }),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const basePlan = (overrides) => ({
  shouldRetry: (best) => !best,
  canStart: () => true,
  canHedge: () => true,
  ...overrides,
});

test("langsamer Erstversuch: Zweitversuch startet parallel, der schnellere gewinnt, der andere wird abgebrochen", async () => {
  const primary = deferred();
  const signals = {};
  const clock = manualDelay();
  const planPromise = runAttemptPlan(
    [{ label: "primary", hedgeAfterMs: 15_000 }, { label: "fallback" }],
    basePlan({
      delay: clock.delay,
      run: (attempt, signal) => {
        signals[attempt.label] = signal;
        if (attempt.label === "primary") {
          signal.addEventListener("abort", () => primary.resolve(null));
          return primary.promise;
        }
        return Promise.resolve({ from: "fallback" });
      },
    }),
  );
  await Promise.resolve();
  clock.fire();
  const plan = await planPromise;

  assert.equal(plan.winner.label, "fallback");
  assert.equal(plan.hedged, true);
  assert.equal(plan.attemptsStarted, 2);
  assert.deepEqual(plan.candidates, [{ from: "fallback" }]);
  assert.equal(signals.primary.aborted, true);
});

test("schneller Erstversuch: kein Zweitversuch", async () => {
  const started = [];
  const plan = await runAttemptPlan(
    [{ label: "primary", hedgeAfterMs: 15_000 }, { label: "fallback" }],
    basePlan({
      delay: manualDelay().delay,
      run: async (attempt) => { started.push(attempt.label); return { from: attempt.label }; },
    }),
  );
  assert.deepEqual(started, ["primary"]);
  assert.equal(plan.hedged, false);
  assert.equal(plan.winner.label, "primary");
});

test("parallel gestartet, aber der erste Fertige ist leer: auf den zweiten wird gewartet", async () => {
  const fallback = deferred();
  const clock = manualDelay();
  const primary = deferred();
  const planPromise = runAttemptPlan(
    [{ label: "primary", hedgeAfterMs: 15_000 }, { label: "fallback" }],
    basePlan({
      delay: clock.delay,
      run: (attempt) => (attempt.label === "primary" ? primary.promise : fallback.promise),
    }),
  );
  await Promise.resolve();
  clock.fire();
  await new Promise((resolve) => setImmediate(resolve));
  primary.resolve(null);
  fallback.resolve({ from: "fallback" });
  const plan = await planPromise;
  assert.equal(plan.winner.label, "fallback");
  assert.equal(plan.attemptsStarted, 2);
});

test("ohne hedgeAfterMs bleibt es sequenziell, und ein Fehler führt zum Folgeversuch", async () => {
  const started = [];
  const plan = await runAttemptPlan(
    [{ label: "primary" }, { label: "fallback" }],
    basePlan({
      run: async (attempt) => {
        started.push(attempt.label);
        if (attempt.label === "primary") throw new Error("Apify 502");
        return { from: attempt.label };
      },
    }),
  );
  assert.deepEqual(started, ["primary", "fallback"]);
  assert.equal(plan.hedged, false);
  assert.equal(plan.winner.label, "fallback");
});

test("ohne Budget startet kein Folgeversuch", async () => {
  const plan = await runAttemptPlan(
    [{ label: "primary" }, { label: "fallback" }],
    basePlan({ canStart: () => false, run: async () => null }),
  );
  assert.equal(plan.attemptsStarted, 1);
  assert.equal(plan.winner, undefined);
});
