import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

type Provider = "instagram" | "facebook" | "website";

export async function runLegacyImport(
  ctx: ActionCtx,
  provider: Provider,
  url: string,
): Promise<Id<"recipes">> {
  const operationId = crypto.randomUUID();
  const started = await ctx.runMutation(api.importOperations.startImport, {
    operationId,
    provider,
    url,
    runImmediately: true,
  });

  if (started.operationId === operationId && started.status === "reserved") {
    await ctx.runAction(internal.importOperations.runImport, {
      userId: started.userId,
      operationId,
    });
  }

  for (let attempt = 0; attempt < 240; attempt++) {
    const operation = await ctx.runQuery(api.importOperations.get, {
      operationId: started.operationId,
    });
    if (operation?.status === "succeeded" && operation.resultRecipeId) {
      return operation.resultRecipeId;
    }
    if (operation?.status === "failed" || operation?.status === "released") {
      throw new Error(JSON.stringify({ type: operation.errorCode ?? "IMPORT_FAILED" }));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(JSON.stringify({ type: "IMPORT_TIMEOUT" }));
}
