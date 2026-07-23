/**
 * Zentraler Logger – Schicht 3 der Observability-Architektur (siehe
 * docs/audit-2026-06/08-ux-fehlertexte-performance.md, Teil 4).
 *
 * Verhalten:
 * - schreibt IMMER in einen In-Memory-Ringpuffer (max. 200 Einträge, kostet nichts)
 * - im DEV-Build (import.meta.env.DEV): zusätzlich Konsolen-Ausgabe wie bisher
 * - im PROD-Build: Konsole bleibt stumm. warn/error werden an registrierte Sinks
 *   weitergegeben (z. B. Sentry-Breadcrumb; error zusätzlich captureException)
 *
 * So bekommt der Entwickler in Produktion denselben Detailgrad wie in der Entwicklung,
 * ohne dass je etwas beim Nutzer aufpoppt oder dauerhaft Logs gesendet werden.
 *
 * Sentry-Anbindung (P1) ist bewusst NICHT hier verdrahtet, sondern als Sink-Hook
 * vorbereitet: Sobald Sentry eingerichtet ist, genügt einmalig
 *   registerLogSink((entry) => {
 *     if (entry.level === 'error') Sentry.captureException(...);
 *     else Sentry.addBreadcrumb(...);
 *   });
 * Keine einzige Call-Site muss dafür erneut angefasst werden.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
  ts: number;
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
};

export type LogSink = (entry: LogEntry) => void;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_RING_CAPACITY = 200;

// ============================================================
// Pure Helfer (unit-getestet in logger.test.mjs)
// ============================================================

export const createLogRingBuffer = (capacity: number = DEFAULT_RING_CAPACITY) => {
  let entries: LogEntry[] = [];
  return {
    push(entry: LogEntry) {
      entries.push(entry);
      if (entries.length > capacity) {
        entries = entries.slice(entries.length - capacity);
      }
    },
    list(): LogEntry[] {
      return entries.slice();
    },
    clear() {
      entries = [];
    },
    get size() {
      return entries.length;
    },
  };
};

/** warn + error verlassen den Ringpuffer Richtung Sink (Sentry); debug/info bleiben lokal. */
export const shouldForwardToSink = (level: LogLevel): boolean =>
  LEVEL_RANK[level] >= LEVEL_RANK.warn;

/** Macht beliebige Log-Daten ring-/transport-tauglich: Error → lesbares Objekt, lange Strings gekürzt. */
export const serializeLogData = (data: unknown): unknown => {
  if (data === undefined) return undefined;
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack };
  }
  if (typeof data === 'string') {
    return data.length > 2000 ? `${data.slice(0, 2000)}…[gekürzt]` : data;
  }
  return data;
};

/** Eine Zeile fürs Debug-Menü / Sentry-Attachment. */
export const formatLogLine = (entry: LogEntry): string => {
  const time = new Date(entry.ts).toISOString();
  const base = `${time} [${entry.level.toUpperCase()}] ${entry.scope}: ${entry.message}`;
  if (entry.data === undefined) return base;
  let dataStr: string;
  try {
    dataStr = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data);
  } catch {
    dataStr = '[unserialisierbar]';
  }
  return `${base} ${dataStr}`;
};

// ============================================================
// Laufzeit-Logger
// ============================================================

const ringBuffer = createLogRingBuffer();
const sinks = new Set<LogSink>();

// import.meta.env in node (Test-Runner) nicht vorhanden → strukturell und defensiv lesen.
const isDev: boolean =
  typeof import.meta !== 'undefined' &&
  Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

const consoleFor = (level: LogLevel): ((...args: unknown[]) => void) => {
  if (level === 'error') return console.error;
  if (level === 'warn') return console.warn;
  if (level === 'info') return console.info;
  return console.debug;
};

const emit = (level: LogLevel, scope: string, message: string, data?: unknown) => {
  const entry: LogEntry = {
    ts: Date.now(),
    level,
    scope,
    message,
    data: serializeLogData(data),
  };

  ringBuffer.push(entry);

  if (isDev) {
    const line = `[${scope}] ${message}`;
    const fn = consoleFor(level);
    if (entry.data === undefined) fn(line);
    else fn(line, entry.data);
  }

  if (shouldForwardToSink(level)) {
    sinks.forEach((sink) => {
      try {
        sink(entry);
      } catch {
        // Logging darf die App niemals zum Absturz bringen.
      }
    });
  }
};

export const logger = {
  debug: (scope: string, message: string, data?: unknown) => emit('debug', scope, message, data),
  info: (scope: string, message: string, data?: unknown) => emit('info', scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => emit('warn', scope, message, data),
  error: (scope: string, message: string, data?: unknown) => emit('error', scope, message, data),
};

/**
 * Registriert einen Sink für warn/error-Einträge (z. B. Sentry, P1).
 * Gibt eine Cleanup-Funktion zum Deregistrieren zurück.
 */
export const registerLogSink = (sink: LogSink): (() => void) => {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
};

/** Die letzten Log-Einträge (für Debug-Menü oder Sentry-Attachment). */
export const getRecentLogs = (): LogEntry[] => ringBuffer.list();

/** Die letzten Logs als ein zusammenhängender Text (für „Logs teilen"). */
export const getRecentLogLines = (): string => ringBuffer.list().map(formatLogLine).join('\n');

export const clearLogs = () => ringBuffer.clear();
