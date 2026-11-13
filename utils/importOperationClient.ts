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

/**
 * Wartet per Abo auf das Ende des Imports: Convex schickt jede Statusänderung sofort, statt dass der
 * Client alle 500 ms eine Abfrage startet (ein Abo statt ~30 Funktionsaufrufen pro Scan).
 * Nach Netzabbruch oder App-Pause verbindet sich das Abo selbst neu und liefert den aktuellen Stand.
 */
export function waitForImport(client: ConvexReactClient, operationId: string, timeoutMs = IMPORT_WAIT_TIMEOUT_MS) {
  return new Promise<ImportOperationResult>((resolve, reject) => {
    const watch = client.watchQuery(api.importOperations.get, { operationId });
    let settled = false;
    let unsubscribe: () => void = () => undefined;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      unsubscribe();
      settle();
    };
    const timer = window.setTimeout(() => finish(() => reject(new Error(JSON.stringify({ type: "IMPORT_TIMEOUT" })))), timeoutMs);
    const check = () => {
      let operation: ImportOperationResult | null | undefined;
      try {
        operation = watch.localQueryResult() as ImportOperationResult | null | undefined;
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      if (operation?.status === "succeeded") finish(() => resolve(operation));
      else if (operation?.status === "failed" || operation?.status === "released") {
        finish(() => reject(new Error(JSON.stringify({ type: operation.errorCode ?? "IMPORT_FAILED" }))));
      }
    };
    unsubscribe = watch.onUpdate(check);
    check();
  });
}
