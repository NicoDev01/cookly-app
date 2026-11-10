/**
 * Führt Scraping-Versuche nacheinander aus; ein Versuch mit `hedgeAfterMs` startet nach dieser
 * Zeit den nächsten parallel ("hedged request"). Der erste brauchbare Kandidat gewinnt, offene
 * Läufe werden abgebrochen und noch abgewartet (keine hängenden Promises in der Convex-Action).
 */

export type PlannedAttempt = { label: string; hedgeAfterMs?: number };

export type AttemptPlanOptions<A extends PlannedAttempt, C> = {
  /** Liefert den Kandidaten oder null; Fehler behandelt der Aufrufer selbst. */
  run(attempt: A, signal: AbortSignal): Promise<C | null>;
  /** true = weiter versuchen (Ergebnis reicht noch nicht). */
  shouldRetry(best: C | null): boolean;
  /** Darf ein sequenzieller Folgeversuch noch starten (Zeitbudget)? */
  canStart(attempt: A): boolean;
  /** Darf ein paralleler Zweitversuch noch starten (Zeitbudget)? */
  canHedge(attempt: A): boolean;
  onHedge?(attempt: A): void;
  delay?(ms: number): { promise: Promise<void>; cancel(): void };
};

export type AttemptPlanResult<A, C> = {
  candidates: C[];
  winner?: A;
  attemptsStarted: number;
  hedged: boolean;
};

const defaultDelay = (ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
};

export async function runAttemptPlan<A extends PlannedAttempt, C>(
  attempts: readonly A[],
  options: AttemptPlanOptions<A, C>,
): Promise<AttemptPlanResult<A, C>> {
  const delay = options.delay ?? defaultDelay;
  const result: AttemptPlanResult<A, C> = { candidates: [], attemptsStarted: 0, hedged: false };

  type Running = { attempt: A; controller: AbortController; done: Promise<{ attempt: A; candidate: C | null }> };
  const start = (attempt: A): Running => {
    const controller = new AbortController();
    result.attemptsStarted += 1;
    const done = options.run(attempt, controller.signal)
      .catch(() => null)
      .then((candidate) => ({ attempt, candidate }));
    return { attempt, controller, done };
  };

  let index = 0;
  while (index < attempts.length) {
    const attempt = attempts[index];
    if (index > 0) {
      if (!options.shouldRetry(result.candidates.at(-1) ?? null)) break;
      if (!options.canStart(attempt)) break;
    }

    const running = [start(attempt)];
    const next = attempts[index + 1];
    if (attempt.hedgeAfterMs && next) {
      const timer = delay(attempt.hedgeAfterMs);
      const finishedEarly = await Promise.race([running[0].done.then(() => true), timer.promise.then(() => false)]);
      timer.cancel();
      if (!finishedEarly && options.canHedge(next)) {
        options.onHedge?.(next);
        result.hedged = true;
        running.push(start(next));
      }
    }

    // In Fertig-Reihenfolge auswerten; der erste ausreichende Kandidat beendet die übrigen Läufe.
    const pending = new Map(running.map((run) => [run.attempt, run]));
    while (pending.size > 0) {
      const outcome = await Promise.race([...pending.values()].map((run) => run.done));
      pending.delete(outcome.attempt);
      if (!outcome.candidate) continue;
      result.candidates.push(outcome.candidate);
      if (!options.shouldRetry(outcome.candidate)) {
        result.winner = outcome.attempt;
        const losers = [...pending.values()];
        for (const run of losers) run.controller.abort();
        await Promise.all(losers.map((run) => run.done));
        break;
      }
    }

    if (result.winner) break;
    index += running.length;
  }
  return result;
}
