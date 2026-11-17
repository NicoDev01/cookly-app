import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { berlinTime } from "./digestModel";
import { sendOpsMail } from "./digest";
import { fetchInstagramEmbed } from "./instagram";
import { fetchTiktokVideoPage } from "./tiktok";
import { CANARY_PLATFORMS, failingPlatforms, pickCanarySamples, type CanaryPlatform } from "./lib/importCanaryModel";

/**
 * Stündlicher Kontroll-Check der Import-Schnellwege (Instagram-Einbettung, TikTok-Videoseite): Ändert eine
 * Plattform ihr Seitenformat oder sperrt Convex aus, fallen Imports zwar still auf Apify zurück, werden aber
 * wieder langsam (10–30 s). Der Check ruft die jüngsten öffentlich importierten Beiträge ab (nur Abruf und
 * Auslesen, kein Gemini, kein Apify) und schickt bei bestätigtem Ausfall eine Mail (höchstens eine pro Tag).
 */

const CONFIRM_DELAY_MS = 5 * 60 * 1000;

export const samples = internalQuery({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("importCache").withIndex("by_expiresAt").order("desc").take(100);
    return pickCanarySamples(entries);
  },
});

const probe = async (platform: CanaryPlatform, id: string): Promise<boolean> => {
  try {
    if (platform === "instagram") return !!(await fetchInstagramEmbed(id))?.caption;
    return !!(await fetchTiktokVideoPage(`https://www.tiktok.com/@_/video/${id}`, id))?.videoId;
  } catch {
    return false;
  }
};

export const run = internalAction({
  args: { confirm: v.optional(v.boolean()) },
  handler: async (ctx, { confirm }): Promise<{ failing: CanaryPlatform[]; checked: Record<CanaryPlatform, number> }> => {
    const ids = await ctx.runQuery(internal.importCanary.samples, {});
    const entries = await Promise.all(
      CANARY_PLATFORMS.map(async (platform) => [platform, await Promise.all(ids[platform].map((id) => probe(platform, id)))] as const),
    );
    const results = Object.fromEntries(entries) as Record<CanaryPlatform, boolean[]>;
    const failing = failingPlatforms(results);
    const checked = Object.fromEntries(entries.map(([platform, list]) => [platform, list.length])) as Record<CanaryPlatform, number>;
    if (!failing.length) return { failing, checked };

    console.warn("[import-canary] Schnellweg fehlgeschlagen", { failing, confirm: !!confirm });
    // Kurze Netzstörung ausschließen: erst ein zweiter Lauf wenige Minuten später alarmiert.
    if (!confirm) {
      await ctx.scheduler.runAfter(CONFIRM_DELAY_MS, internal.importCanary.run, { confirm: true });
      return { failing, checked };
    }

    const labels = failing.map((platform) => (platform === "instagram" ? "Instagram" : "TikTok")).join(" und ");
    await sendOpsMail({
      subject: `⚠ Import-Schnellweg ausgefallen: ${labels} – Cookly`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:14px;max-width:560px">
<h2>Import-Schnellweg ausgefallen: ${labels}</h2>
<p>Der stündliche Check konnte zweimal hintereinander keinen der zuletzt importierten öffentlichen Beiträge auslesen.</p>
<p><strong>Für Nutzer:</strong> Imports funktionieren weiter über Apify, dauern aber wieder 10–30 s und kosten Apify-Budget.</p>
<p><strong>Vorgehen:</strong> Seitenformat prüfen (convex/lib/instagramContent.ts bzw. tiktokContent.ts). Den Schnellweg abschalten ist nicht nötig, er fällt von selbst zurück; falls gewünscht:
<code>npx convex env set ${failing.includes("instagram") ? "INSTAGRAM_EMBED_FAST_PATH" : "TIKTOK_PAGE_FAST_PATH"} false --prod</code></p>
</div>`,
      idempotencyKey: `cookly-alert/fast-path/${failing.join("+")}/${berlinTime(Date.now()).date}`,
    });
    return { failing, checked };
  },
});
