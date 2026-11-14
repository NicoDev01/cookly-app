import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  IMPORT_CACHE_TTL_MS,
  IMPORT_CACHE_VERSION,
  cacheRecipeFromPayload,
  importCacheEnabled,
} from "./lib/importCacheKey";

/**
 * Geteilter Import-Cache: Importiert jemand einen Link, den schon ein anderer Nutzer importiert hat, entfallen
 * Scraping (Apify, Website-Abruf) und Gemini.
 *
 * Abgrenzung zwischen Konten:
 * - Der Cache hält nur öffentlich extrahierte Rezeptfelder (Titel, Zutaten, Schritte …), keine Nutzer-IDs,
 *   keine Bearbeitungen, Notizen oder Favoriten. Gespeichert wird direkt nach der Extraktion, bevor ein Nutzer
 *   etwas ändern kann; spätere Bearbeitungen fließen nie zurück.
 * - Ausschließlich internal-Funktionen, kein Client kann ihn lesen oder auflisten.
 * - Ein Treffer legt über den normalen Weg (`completeLink`) ein eigenes Rezept im Konto des Nutzers an.
 *   Sein Bild wird in nutzereigenen Storage kopiert; Storage wird nie zwischen Nutzern oder mit dem Cache geteilt.
 * - Rate-Limits, Kontingente und der Duplikat-Check je Nutzer laufen unverändert.
 *
 * Abschalten ohne Deploy: `npx convex env set IMPORT_CACHE_ENABLED false`.
 */

const enabled = () => importCacheEnabled(process.env.IMPORT_CACHE_ENABLED);

export type ImportCacheInfo = { key: string; hit: boolean; imageStorageId?: Id<"_storage"> };

export const lookup = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!enabled()) return null;
    const entry = await ctx.db.query("importCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!entry || entry.version !== IMPORT_CACHE_VERSION || entry.expiresAt <= Date.now()) return null;
    const imageUrl = entry.imageStorageId ? await ctx.storage.getUrl(entry.imageStorageId) : null;
    return {
      recipe: entry.recipe,
      sourceImageUrl: entry.sourceImageUrl,
      imageStorageId: imageUrl ? entry.imageStorageId : undefined,
      imageUrl: imageUrl ?? undefined,
    };
  },
});

/**
 * Treffer als Import-Ergebnis im Format der Plattform-Actions (für `completeLink`), sonst null.
 * `sourceUrl` ist die normalisierte URL dieses Nutzers (für seinen Duplikat-Check).
 */
export async function cachedImportResult(
  ctx: ActionCtx,
  key: string | null,
  sourceUrl: string,
): Promise<{ payload: Record<string, unknown>; cache: ImportCacheInfo; scrapeStats: { scrapeMs: number; attemptsStarted: number; hedged: boolean; winner: string } } | null> {
  if (!key) return null;
  const startedAt = Date.now();
  let entry;
  try {
    entry = await ctx.runQuery(internal.importCache.lookup, { key });
  } catch (error) {
    // Der Cache darf einen Import nie verhindern.
    console.warn("import cache lookup failed", error instanceof Error ? error.message : String(error));
    return null;
  }
  if (!entry) return null;
  const { recipe } = entry;
  return {
    payload: {
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, checked: false })),
      // Sofort anzeigen (Cache-Kopie), danach kopiert proxyImportedImage es in den Storage des Nutzers.
      image: entry.imageUrl ?? entry.sourceImageUrl,
      sourceImageUrl: entry.sourceImageUrl ?? entry.imageUrl,
      sourceUrl,
      imageAlt: recipe.title,
      isFavorite: false,
    },
    cache: { key, hit: true, imageStorageId: entry.imageStorageId },
    scrapeStats: { scrapeMs: Date.now() - startedAt, attemptsStarted: 0, hedged: false, winner: "cache" },
  };
}

export const recordHit = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const entry = await ctx.db.query("importCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (entry) await ctx.db.patch(entry._id, { hitCount: entry.hitCount + 1, lastHitAt: Date.now() });
  },
});

/** Frisch extrahiertes, vollständiges Ergebnis übernehmen (aus `completeLink`, vor jeder Nutzerbearbeitung). */
export const store = internalMutation({
  args: { key: v.string(), provider: v.string(), payload: v.any() },
  handler: async (ctx, { key, provider, payload }) => {
    if (!enabled()) return;
    const recipe = cacheRecipeFromPayload(payload);
    if (!recipe) return;
    const now = Date.now();
    const existing = await ctx.db.query("importCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    // Gültiger Eintrag vorhanden (z. B. zwei Nutzer gleichzeitig): behalten, nichts doppelt laden.
    if (existing && existing.version === IMPORT_CACHE_VERSION && existing.expiresAt > now) return;
    if (existing) {
      if (existing.imageStorageId) await ctx.storage.delete(existing.imageStorageId).catch(() => undefined);
      await ctx.db.delete(existing._id);
    }

    const rawImage = typeof payload?.sourceImageUrl === "string" ? payload.sourceImageUrl : "";
    // Generierte Ersatzbilder nicht festhalten: Sie entstehen pro Nutzer neu (und kosten Budget).
    const sourceImageUrl = /^https:\/\//i.test(rawImage) && !/pollinations\.ai/i.test(rawImage) ? rawImage : undefined;
    await ctx.db.insert("importCache", {
      key,
      provider,
      version: IMPORT_CACHE_VERSION,
      recipe,
      sourceImageUrl,
      createdAt: now,
      expiresAt: now + IMPORT_CACHE_TTL_MS,
      hitCount: 0,
    });
    // Social-CDN-Links laufen nach Stunden bis Tagen ab: eigene Kopie für spätere Treffer.
    // Website-Bilder sind dauerhaft erreichbar, dort genügt der Link.
    if (sourceImageUrl && provider !== "website") {
      await ctx.scheduler.runAfter(0, internal.remoteImages.storeImportCacheImage, {
        key,
        createdAt: now,
        sourceUrl: typeof payload?.sourceUrl === "string" ? payload.sourceUrl : undefined,
        imageUrl: sourceImageUrl,
      });
    }
  },
});

export const attachImage = internalMutation({
  args: { key: v.string(), createdAt: v.number(), storageId: v.id("_storage") },
  handler: async (ctx, { key, createdAt, storageId }) => {
    const entry = await ctx.db.query("importCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!entry || entry.createdAt !== createdAt || entry.imageStorageId) {
      await ctx.storage.delete(storageId);
      return false;
    }
    await ctx.db.patch(entry._id, { imageStorageId: storageId });
    return true;
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db.query("importCache")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(100);
    for (const entry of expired) {
      if (entry.imageStorageId) await ctx.storage.delete(entry.imageStorageId).catch(() => undefined);
      await ctx.db.delete(entry._id);
    }
    if (expired.length === 100) await ctx.scheduler.runAfter(0, internal.importCache.cleanupExpired, {});
    return expired.length;
  },
});
