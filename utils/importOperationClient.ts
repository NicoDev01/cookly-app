import type { ConvexReactClient } from "convex/react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

export type ImportOperationResult = {
  status: "reserved" | "running" | "succeeded" | "failed" | "released";
  resultRecipeId?: Id<"recipes">;
  resultDraft?: unknown;
  errorCode?: string;
};

export async function waitForImport(client: ConvexReactClient, operationId: string, timeoutMs = 120_000) {
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
