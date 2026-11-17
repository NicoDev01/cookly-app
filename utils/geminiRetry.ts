export type GeminiApiErrorInfo = {
  code?: number;
  status?: string;
  message?: string;
};

export type GeminiRetryOptions = {
  delaysMs?: readonly number[];
  onRetry?: (details: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: unknown;
  }) => void;
};

const DEFAULT_RETRY_DELAYS_MS = [1000, 2500, 5000] as const;
/** Zeitlimit je Text-Anfrage. Ohne Limit hing eine Anfrage bei Überlast bis zu 60 s; ein Neuversuch ist meist schnell. */
export const GEMINI_TEXT_TIMEOUT_MS = 20_000;
/** Foto-Scan: Bild plus längere Antwort, daher mehr Luft; ein Hänger wird trotzdem abgebrochen und wiederholt. */
export const GEMINI_IMAGE_TIMEOUT_MS = 35_000;
const RETRYABLE_CODES = new Set([429, 500, 503, 504]);
const RETRYABLE_STATUSES = new Set(["RESOURCE_EXHAUSTED", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED"]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const readString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const readNumber = (value: unknown): number | undefined => {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const parseJsonObjectFromText = (text: string): Record<string, unknown> | null => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const extractInfoFromRecord = (record: Record<string, unknown>): GeminiApiErrorInfo => {
  const nested = isRecord(record.error) ? record.error : record;

  return {
    code: readNumber(nested.code),
    status: readString(nested.status),
    message: readString(nested.message),
  };
};

export const getGeminiApiErrorInfo = (error: unknown): GeminiApiErrorInfo => {
  if (isRecord(error)) {
    const direct = extractInfoFromRecord(error);
    if (direct.code || direct.status) return direct;
  }

  const message = error instanceof Error ? error.message : readString(error);
  if (!message) return {};

  const parsed = parseJsonObjectFromText(message);
  if (parsed) {
    const fromJson = extractInfoFromRecord(parsed);
    if (fromJson.code || fromJson.status || fromJson.message) return fromJson;
  }

  return { message };
};

const isTimeoutError = (error: unknown) =>
  error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError" || /aborted|timed? ?out/i.test(error.message));

export const isRetryableGeminiError = (error: unknown): boolean => {
  if (isTimeoutError(error)) return true;
  const info = getGeminiApiErrorInfo(error);
  // 402: Guthaben aufgebraucht. Kommt mit Status RESOURCE_EXHAUSTED, ein Neuversuch hilft aber nicht.
  if (info.code === 402) return false;
  if (typeof info.code === "number" && RETRYABLE_CODES.has(info.code)) return true;
  if (info.status && RETRYABLE_STATUSES.has(info.status)) return true;
  return false;
};

const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const runWithGeminiRetry = async <T>(
  operation: () => Promise<T>,
  options: GeminiRetryOptions = {},
): Promise<T> => {
  const delaysMs = options.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const maxAttempts = delaysMs.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const shouldRetry = attempt < maxAttempts && isRetryableGeminiError(error);
      if (!shouldRetry) throw error;

      const delayMs = delaysMs[attempt - 1] ?? 0;
      options.onRetry?.({ attempt, maxAttempts, delayMs, error });
      if (delayMs > 0) await delay(delayMs);
    }
  }

  throw new Error("Gemini retry loop exited unexpectedly");
};

// Fehlt ein Modell (abgeschaltet/umbenannt), soll ebenfalls das Ersatzmodell greifen.
const isModelUnavailableError = (error: unknown): boolean => {
  const info = getGeminiApiErrorInfo(error);
  return info.code === 404 || info.status === "NOT_FOUND";
};

/**
 * Ab wann eine zweite, gleiche Anfrage parallel startet ("hedged request"). Gemessen 2026-11-17: 3.1 Flash-Lite
 * antwortet meist in 2–3 s, rund 5 % der Antworten brauchen über 6 s, einzelne Ausreißer 17 s.
 */
export const GEMINI_TEXT_HEDGE_MS = 6_000;
/** Foto-Scan: Bilder brauchen länger (Median 2,5 s, p90 bis 7 s), daher später absichern. */
export const GEMINI_IMAGE_HEDGE_MS = 9_000;

/**
 * Startet die Anfrage; ist sie nach `hedgeAfterMs` nicht fertig, läuft eine zweite parallel. Die erste
 * erfolgreiche Antwort gewinnt, die andere wird abgebrochen. Scheitert die erste Anfrage, bevor die zweite
 * startet, geht der Fehler sofort weiter (Neuversuch/Ersatzmodell entscheiden wie bisher).
 */
export const runHedged = <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  hedgeAfterMs?: number,
  onHedge?: () => void,
): Promise<T> => {
  if (!hedgeAfterMs) return operation(new AbortController().signal);

  return new Promise<T>((resolve, reject) => {
    const controllers: AbortController[] = [];
    let settled = false;
    let running = 0;
    let firstError: { error: unknown } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      settled = true;
      if (timer) clearTimeout(timer);
      for (const controller of controllers) controller.abort();
    };
    const start = () => {
      const controller = new AbortController();
      controllers.push(controller);
      running++;
      operation(controller.signal).then(
        (value) => {
          if (settled) return;
          finish();
          resolve(value);
        },
        (error) => {
          running--;
          if (settled) return;
          firstError ??= { error };
          // Läuft die andere Anfrage noch, auf sie warten. Scheitert die erste vor dem Parallelstart: sofort weiter.
          if (running > 0) return;
          finish();
          reject(firstError.error);
        },
      );
    };

    start();
    timer = setTimeout(() => {
      timer = undefined;
      if (settled) return;
      onHedge?.();
      start();
    }, hedgeAfterMs);
  });
};

export type GeminiFallbackOptions = GeminiRetryOptions & {
  onFallback?: (details: { from: string; to: string; error: unknown }) => void;
  /** Zweite parallele Anfrage, wenn die erste so lange (ms) nicht antwortet. */
  hedgeAfterMs?: number;
  onHedge?: (details: { model: string }) => void;
};

/**
 * Probiert die Modelle der Reihe nach. Bei Überlastung oder fehlendem Modell geht es sofort zum nächsten
 * Modell (gemessen 2026-11-17: das überlastete Modell brauchte im Neuversuch bis 10 s, das Ersatzmodell 2,5–3,7 s).
 * Sind alle überlastet, startet nach der nächsten Wartezeit aus `delaysMs` eine neue Runde über alle Modelle:
 * Überlast trifft oft ein Modell nur kurz (gesehen 2026-11-17: 3.1 und 3.5 beide 503, 3.1 Minuten später ok).
 * Inhaltliche Fehler werden direkt weitergereicht; ein fehlendes Modell wird nicht erneut versucht.
 */
export const runWithGeminiModelFallback = async <T>(
  models: readonly string[],
  operation: (model: string, signal: AbortSignal) => Promise<T>,
  options: GeminiFallbackOptions = {},
): Promise<T> => {
  if (models.length === 0) throw new Error("No Gemini model configured");
  const delaysMs = options.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const maxAttempts = delaysMs.length + 1;
  let pool = [...models];
  let lastError: unknown;

  for (let round = 0; round < maxAttempts && pool.length > 0; round++) {
    if (round > 0) {
      const delayMs = delaysMs[round - 1] ?? 0;
      options.onRetry?.({ attempt: round, maxAttempts, delayMs, error: lastError });
      if (delayMs > 0) await delay(delayMs);
    }
    const roundModels = pool;
    for (const [index, model] of roundModels.entries()) {
      try {
        return await runHedged((signal) => operation(model, signal), options.hedgeAfterMs, () => options.onHedge?.({ model }));
      } catch (error) {
        const gone = isModelUnavailableError(error);
        if (!gone && !isRetryableGeminiError(error)) throw error;
        lastError = error;
        if (gone) pool = pool.filter((m) => m !== model);
        const next = roundModels[index + 1];
        if (next) options.onFallback?.({ from: model, to: next, error });
      }
    }
  }

  throw lastError;
};

export const getAiScanErrorMessage = (error: unknown): string => {
  const info = getGeminiApiErrorInfo(error);

  if (info.code === 503 || info.status === "UNAVAILABLE") {
    return "Die KI ist gerade stark ausgelastet. Wir haben es mehrfach versucht. Bitte probiere es in ein paar Minuten erneut.";
  }

  if (info.code === 429 || info.status === "RESOURCE_EXHAUSTED") {
    return "Die KI-Anfrage wurde wegen zu vieler Anfragen begrenzt. Bitte warte kurz und versuche es erneut.";
  }

  if (info.code === 504 || info.status === "DEADLINE_EXCEEDED") {
    return "Die KI-Analyse hat zu lange gedauert. Bitte versuche es mit einem klareren oder kleineren Foto erneut.";
  }

  return error instanceof Error
    ? error.message
    : readString(error) ?? "Die KI-Analyse ist fehlgeschlagen. Bitte versuche es erneut.";
};
