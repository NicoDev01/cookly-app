import type { ConvexReactClient } from "convex/react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

export type ImportOperationResult = {
  status: "reserved" | "running" | "succeeded" | "failed" | "released";
  resultRecipeId?: Id<"recipes">;
  resultDraft?: unknown;
  errorCode?: string;
};

/**
 * Muss über dem Server-Budget liegen: Scraping bis 95 s (SCRAPE_PHASE_BUDGET_MS) plus Gemini und Writes.
 * Läuft es trotzdem ab, arbeitet der Server weiter und das Rezept erscheint später in der Sammlung.
 */
export const IMPORT_WAIT_TIMEOUT_MS = 150_000;

/**
 * Ein stiller Zweitversuch lohnt nur bei Dienstfehlern (Apify/Gemini kurz gestört), die schnell kamen.
 * Hat der erste Versuch schon lange gedauert, ist ein Ausweg (Screenshot, manuell) besser als
 * eine weitere Minute Spinner.
 */
export const AUTO_RETRY_MAX_ELAPSED_MS = 60_000;

export const shouldAutoRetryImport = (errorType: unknown, elapsedMs: number) =>
  errorType === "API_UNAVAILABLE" && elapsedMs < AUTO_RETRY_MAX_ELAPSED_MS;

export async function waitForImport(client: ConvexReactClient, operationId: string, timeoutMs = IMPORT_WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const operation = await client.query(api.importOperations.get, { operationId }) as ImportOperationResult | null;
    if (operation?.status === "succeeded") return operation;
    if (operation?.status === "failed" || operation?.status === "released") {
      throw new Error(JSON.stringify({ type: operation.errorCode ?? "IMPORT_FAILED" }));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(JSON.stringify({ type: "IMPORT_TIMEOUT" }));
}
