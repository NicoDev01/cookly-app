/**
 * Leitet aus einem Import-Fehler einen stabilen Code für `importOperations.errorCode` ab.
 * Fehler aus `ctx.runAction` kommen mit Präfix ("Uncaught Error: {...}"), daher wird das
 * JSON-Objekt im Text gesucht statt die ganze Nachricht zu parsen.
 */
export function importErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const start = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(message.slice(start, end + 1)) as { type?: unknown };
      if (typeof parsed.type === "string" && parsed.type) return parsed.type.slice(0, 80);
    } catch { /* use stable fallback below */ }
  }
  const code = message.match(/\b(INVALID_[A-Z_]+|NO_RECIPE[A-Z_]*|NOT_AUTHENTICATED)\b/);
  return code ? code[1].slice(0, 80) : "IMPORT_FAILED";
}
