/**
 * Reine Helfer für den Import aus der iOS-Share-Extension (`/share/import`, `shareTokens.ts`).
 * Ohne Convex-Importe, damit die Tests sie direkt laden können.
 */

export const SHARE_TOKEN_TTL_MS = 90 * 24 * 60 * 60_000;
export const MAX_SHARE_TOKENS_PER_USER = 5;
const TOKEN_PREFIX = "cks_";

/** 32 zufällige Bytes als base64url, mit Präfix (erkennbar, falls er irgendwo auftaucht). */
export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return TOKEN_PREFIX + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** `Authorization: Bearer <token>` → Token, sonst null (auch bei falscher Form). */
export function parseBearerToken(header: string | null | undefined): string | null {
  const match = header?.trim().match(/^Bearer\s+(cks_[A-Za-z0-9_-]{43})$/i);
  return match ? match[1] : null;
}

export function isValidInstallationId(value: string) {
  return /^[A-Za-z0-9._:-]{8,128}$/.test(value);
}

export type ShareImportRequest = { operationId: string; url: string; text?: string; title?: string };

/** Body von `POST /share/import` prüfen; nur Strings, mit Längengrenzen. */
export function parseShareImportBody(body: unknown): ShareImportRequest | null {
  if (!body || typeof body !== "object") return null;
  const { operationId, url, text, title } = body as Record<string, unknown>;
  if (typeof operationId !== "string" || operationId.length > 64) return null;
  if (typeof url !== "string" || !url || url.length > 2048) return null;
  if (text !== undefined && (typeof text !== "string" || text.length > 5000)) return null;
  if (title !== undefined && (typeof title !== "string" || title.length > 500)) return null;
  return { operationId, url, text, title };
}

/** Gleiche Zusammensetzung wie `pages/ShareTargetPage.tsx` für `detectImportTarget`. */
export function sharedTextFor(request: Pick<ShareImportRequest, "url" | "text" | "title">) {
  return `${request.title || ""} ${request.text || ""} ${request.url || ""}`;
}

export type ShareErrorResponse = { status: number; body: Record<string, unknown> };

/**
 * Fehler aus `startImportForUser` (über `runMutation` mit Präfix „Uncaught Error: …“) auf
 * stabile JSON-Antworten abbilden. Unbekanntes wird zu IMPORT_FAILED (500).
 */
export function mapShareImportError(error: unknown): ShareErrorResponse {
  const message = error instanceof Error ? error.message : String(error);
  const start = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(message.slice(start, end + 1)) as Record<string, unknown>;
      if (parsed.type === "LIMIT_REACHED") {
        return { status: 402, body: { error: "LIMIT_REACHED", feature: parsed.feature, current: parsed.current, limit: parsed.limit } };
      }
      if (parsed.type === "RATE_LIMIT_EXCEEDED") return { status: 429, body: { error: "RATE_LIMIT_EXCEEDED", resetAt: parsed.resetAt } };
      if (parsed.type === "PROVIDER_BUDGET_EXHAUSTED") return { status: 503, body: { error: "PROVIDER_BUDGET_EXHAUSTED" } };
    } catch { /* plain code below */ }
  }
  const code = message.match(/\b(INVALID_IMPORT_URL|IMPORT_URL_REQUIRED|INVALID_OPERATION_ID|NOT_AUTHENTICATED)\b/)?.[1];
  if (code === "NOT_AUTHENTICATED") return { status: 401, body: { error: "UNAUTHORIZED" } };
  if (code === "INVALID_OPERATION_ID") return { status: 400, body: { error: "INVALID_OPERATION_ID" } };
  // `new URL()` in normalizeUrl wirft bei kaputten Links „TypeError: Invalid URL“.
  if (code || /\bInvalid URL\b/.test(message)) return { status: 400, body: { error: "INVALID_IMPORT_URL" } };
  return { status: 500, body: { error: "IMPORT_FAILED" } };
}

type PollOperation = {
  operationId: string;
  status: "reserved" | "running" | "succeeded" | "failed" | "released";
  phase?: string;
  errorCode?: string;
  previewImageUrl?: string;
};
type PollRecipe = {
  _id: string;
  title: string;
  category: string;
  portions: number;
  prepTimeMinutes: number;
  ingredients: Array<{ name: string; amount?: string }>;
  instructions: Array<{ text: string }>;
};

/**
 * Antwort von `GET /share/import`: Status und Vorschaubild schon während des Ladens; bei Erfolg das
 * ganze Rezept wie in der App-Importansicht. Die Extension hört nach `succeeded` auf zu pollen.
 */
export function buildSharePollResponse(operation: PollOperation, recipe: PollRecipe | null, imageUrl: string | null) {
  const base = {
    operationId: operation.operationId,
    status: operation.status,
    phase: operation.phase ?? null,
    errorCode: operation.errorCode ?? null,
    previewImageUrl: operation.previewImageUrl ?? null,
  };
  if (operation.status !== "succeeded" || !recipe) return { ...base, recipe: null };
  return {
    ...base,
    recipe: {
      recipeId: recipe._id,
      title: recipe.title,
      imageUrl,
      category: recipe.category,
      portions: recipe.portions,
      prepTimeMinutes: recipe.prepTimeMinutes,
      ingredients: recipe.ingredients.map(({ name, amount }) => ({ name, amount: amount ?? null })),
      instructions: recipe.instructions.map(({ text }) => ({ text })),
    },
  };
}
