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

export const isRetryableGeminiError = (error: unknown): boolean => {
  const info = getGeminiApiErrorInfo(error);
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

export type GeminiFallbackOptions = GeminiRetryOptions & {
  onFallback?: (details: { from: string; to: string; error: unknown }) => void;
};

/**
 * Probiert die Modelle der Reihe nach, jedes mit eigenen Retries. Zum nächsten Modell geht es
 * nur bei Überlastung oder fehlendem Modell; inhaltliche Fehler werden direkt weitergereicht.
 */
export const runWithGeminiModelFallback = async <T>(
  models: readonly string[],
  operation: (model: string) => Promise<T>,
  options: GeminiFallbackOptions = {},
): Promise<T> => {
  if (models.length === 0) throw new Error("No Gemini model configured");

  for (const [index, model] of models.entries()) {
    try {
      return await runWithGeminiRetry(() => operation(model), options);
    } catch (error) {
      const next = models[index + 1];
      if (!next || !(isRetryableGeminiError(error) || isModelUnavailableError(error))) throw error;
      options.onFallback?.({ from: model, to: next, error });
    }
  }

  throw new Error("Gemini fallback loop exited unexpectedly");
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
