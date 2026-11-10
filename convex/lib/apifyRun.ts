/**
 * Startet einen Apify-Actor asynchron und wartet per Long-Polling auf das Ende.
 *
 * Früher lief der Import über `run-sync-get-dataset-items` mit hartem Client-Timeout: Lief
 * Instagram bei Apify länger (real 30–77 s, Nov. 2026), brach Cookly ab und verwarf das
 * bereits bezahlte, erfolgreiche Ergebnis. Hier läuft der Actor bis zum Ende oder bis zur
 * Deadline; nur ein ausdrücklicher Abbruch (Deadline, paralleler Gewinner) stoppt ihn.
 */

const API = "https://api.apify.com/v2";
/** Apify erlaubt höchstens 60 s `waitForFinish` pro Anfrage. */
const MAX_WAIT_SECONDS = 60;
const ABORT_TIMEOUT_MS = 3_000;
const TERMINAL_FAILURES = new Set(["FAILED", "TIMED-OUT", "ABORTED"]);

type ApifyRun = { id: string; status: string; defaultDatasetId: string };

export type ApifyRunOptions = {
  token: string;
  /** Absoluter Zeitpunkt (ms), bis zu dem auf das Ergebnis gewartet wird. */
  deadlineAt: number;
  /** Abbruch von außen, z. B. weil ein paralleler Versuch schon gewonnen hat. */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export type ApifyRunErrorReason = "deadline" | "cancelled" | "run_failed" | "http";

export class ApifyRunError extends Error {
  reason: ApifyRunErrorReason;

  constructor(message: string, reason: ApifyRunErrorReason) {
    super(message);
    this.reason = reason;
  }
}

const waitSeconds = (deadlineAt: number, now: number) =>
  Math.max(0, Math.min(MAX_WAIT_SECONDS, Math.floor((deadlineAt - now) / 1000)));

export async function runApifyActorUntilDone(
  actor: string,
  input: Record<string, unknown>,
  options: ApifyRunOptions,
): Promise<unknown[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const headers = { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" };

  const request = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, headers, signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted) throw new ApifyRunError(`Apify ${actor} cancelled`, "cancelled");
      throw error;
    }
    if (!response.ok) {
      throw new ApifyRunError(`Apify ${actor} failed: ${response.status} ${response.statusText}`, "http");
    }
    return response.json() as Promise<T>;
  };

  const start = await request<{ data: ApifyRun }>(
    `${API}/acts/${actor}/runs?waitForFinish=${waitSeconds(options.deadlineAt, now())}`,
    { method: "POST", body: JSON.stringify(input) },
  );
  let run = start.data;

  // Spart Apify-Kosten, wenn wir das Ergebnis nicht mehr brauchen. Kurz begrenzt und fehlertolerant.
  const abortRun = () =>
    fetchImpl(`${API}/actor-runs/${run.id}/abort`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(ABORT_TIMEOUT_MS),
    }).then(() => undefined, () => undefined);

  try {
    while (run.status !== "SUCCEEDED") {
      if (TERMINAL_FAILURES.has(run.status)) {
        throw new ApifyRunError(`Apify ${actor} run ${run.status}`, "run_failed");
      }
      const seconds = waitSeconds(options.deadlineAt, now());
      if (seconds === 0) {
        await abortRun();
        throw new ApifyRunError(`Apify ${actor} not finished before deadline`, "deadline");
      }
      run = (await request<{ data: ApifyRun }>(`${API}/actor-runs/${run.id}?waitForFinish=${seconds}`)).data;
    }
  } catch (error) {
    if (error instanceof ApifyRunError && error.reason === "cancelled") await abortRun();
    throw error;
  }

  const items = await request<unknown>(`${API}/datasets/${run.defaultDatasetId}/items?clean=true`);
  if (!Array.isArray(items)) {
    throw new ApifyRunError(`Apify ${actor} returned non-array dataset items`, "http");
  }
  return items;
}
