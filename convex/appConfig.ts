import { v } from "convex/values";

import { query } from "./_generated/server";

/**
 * Mindestversion für das Pflicht-Update, gesetzt als Convex-Umgebungsvariable
 * MIN_APP_VERSION_ANDROID bzw. MIN_APP_VERSION_IOS (z. B. "1.5.1"). Leer = kein Pflicht-Update.
 * Die App fragt einmal beim Start und beim Zurückkehren in die App ab (kein Abo, siehe CLAUDE.md).
 */
export const minAppVersion = query({
  args: { platform: v.union(v.literal("android"), v.literal("ios")) },
  handler: async (_ctx, { platform }) => {
    const value = platform === "android" ? process.env.MIN_APP_VERSION_ANDROID : process.env.MIN_APP_VERSION_IOS;
    return value?.trim() || null;
  },
});
