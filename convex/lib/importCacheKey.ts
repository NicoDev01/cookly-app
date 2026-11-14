/**
 * Schlüssel für den geteilten Import-Cache (convex/importCache.ts). Zwei Links teilen sich nur dann einen Eintrag,
 * wenn sie sicher auf denselben öffentlichen Inhalt zeigen: Tracking-Parameter fallen weg, jeder andere
 * Query-Parameter bleibt Teil des Schlüssels (private oder ID-Links kollidieren so nie).
 */

/** Hochzählen, wenn Prompts, Modelle oder die Extraktion sich ändern: ältere Einträge werden dann ignoriert. */
export const IMPORT_CACHE_VERSION = 1;
export const IMPORT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "yclid", "twclid", "ttclid", "igsh", "igshid",
  "si", "ref", "ref_src", "_ga", "_gl", "mkt_tok", "spm",
]);
const TRACKING_PREFIXES = ["utm_", "mc_", "pk_", "hsa_"];

const isTrackingParam = (name: string) => {
  const key = name.toLowerCase();
  return TRACKING_PARAMS.has(key) || TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix));
};

export function websiteCacheKey(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const params = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const search = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const port = url.port ? `:${url.port}` : "";
  return `web:${host}${port}${path}${search}`;
}

/** Nur mit eindeutiger Beitrags-ID (Shortcode, Video-ID); ohne ID kein Cache. */
export function socialCacheKey(provider: string, targetKey: string | undefined): string | null {
  if (!targetKey || !/^[A-Za-z0-9_-]{5,64}$/.test(targetKey)) return null;
  if (!["instagram", "tiktok", "facebook"].includes(provider)) return null;
  return `${provider}:${targetKey}`;
}

export const importCacheEnabled = (value: string | undefined) => (value ?? "true").toLowerCase() !== "false";

type CacheIngredient = { name: string; amount?: string };
type CacheInstruction = { text: string; icon?: string };
export type CacheRecipe = {
  title: string;
  category: string;
  prepTimeMinutes: number;
  difficulty: "Einfach" | "Mittel" | "Schwer";
  portions: number;
  ingredients: CacheIngredient[];
  instructions: CacheInstruction[];
};

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * Nur die Rezeptfelder aus einem frisch extrahierten Payload übernehmen, ohne Nutzerbezug.
 * Liefert null, wenn das Ergebnis nicht vollständig genug für andere Nutzer ist.
 */
export function cacheRecipeFromPayload(payload: unknown): CacheRecipe | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const title = text(p.title, 300);
  const category = text(p.category, 60);
  const difficulty = ["Einfach", "Mittel", "Schwer"].includes(p.difficulty as string)
    ? (p.difficulty as CacheRecipe["difficulty"])
    : null;
  const prepTimeMinutes = Number(p.prepTimeMinutes);
  const portions = Number(p.portions);
  const ingredients = (Array.isArray(p.ingredients) ? p.ingredients : [])
    .map((item) => ({ name: text(item?.name, 300), amount: text(item?.amount, 120) }))
    .filter((item) => item.name)
    .slice(0, 120)
    .map(({ name, amount }) => (amount ? { name, amount } : { name }));
  const instructions = (Array.isArray(p.instructions) ? p.instructions : [])
    .map((item) => ({ text: text(item?.text, 4000), icon: text(item?.icon, 60) }))
    .filter((item) => item.text)
    .slice(0, 80)
    .map(({ text: step, icon }) => (icon ? { text: step, icon } : { text: step }));
  if (!title || !category || !difficulty || !Number.isFinite(prepTimeMinutes) || !Number.isFinite(portions)) return null;
  if (ingredients.length < 2 || instructions.length < 1) return null;
  return { title, category, prepTimeMinutes, difficulty, portions, ingredients, instructions };
}
