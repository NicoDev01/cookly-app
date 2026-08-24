import { toRecord } from "../socialImportShared.ts";

/** Anzahl Untertitelspuren, die höchstens in den Gemini-Input wandern. */
export const MAX_SUBTITLE_TRACKS = 2;

const TRACKING_PARAMS_TO_DROP = new Set([
  "is_from_webapp", "sender_device", "web_id", "_r", "_t", "checksum",
  "share_app_id", "share_item_id", "share_link_id", "sharer_language",
  "social_share_type", "source", "timestamp", "tt_from", "u_code",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
]);

const SUPPORTED_HOSTS = ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"];

/** `vm.`/`vt.`-Kurzlinks erzeugt die TikTok-App beim Teilen; sie zeigen erst nach einem Redirect auf das Video. */
export const isTiktokShortLinkHost = (host: string): boolean =>
  host === "vm.tiktok.com" || host === "vt.tiktok.com";

export const isSupportedTiktokUrl = (rawUrl: string): boolean => {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!SUPPORTED_HOSTS.includes(host)) return false;
    if (isTiktokShortLinkHost(host)) return parsed.pathname.length > 1;

    const path = parsed.pathname.toLowerCase();
    return /\/@[^/]+\/(video|photo)\/\d+/.test(path) || path.startsWith("/t/") || path.startsWith("/v/");
  } catch {
    return false;
  }
};

export const extractTiktokVideoId = (url: string): string => {
  const match = url.match(/\/(?:video|photo)\/(\d+)/);
  return match ? match[1] : "";
};

export const canonicalizeTiktokUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS_TO_DROP.has(key) || key.startsWith("utm_")) parsed.searchParams.delete(key);
    }
    parsed.hash = "";

    if (isTiktokShortLinkHost(host)) {
      parsed.hostname = host;
      return parsed.toString();
    }

    parsed.hostname = "www.tiktok.com";
    const videoId = extractTiktokVideoId(parsed.pathname);
    const author = parsed.pathname.match(/\/(@[^/]+)\//);
    if (videoId && author) {
      parsed.search = "";
      parsed.pathname = `/${author[1]}/video/${videoId}`;
    }
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
};

export const needsTiktokRedirectResolution = (canonicalUrl: string): boolean => {
  try {
    const parsed = new URL(canonicalUrl);
    return isTiktokShortLinkHost(parsed.hostname.toLowerCase()) || /^\/(t|v)\//.test(parsed.pathname);
  } catch {
    return false;
  }
};

/**
 * Untertitel liegen als Linkliste im Dataset-Item. ASR (echte Spracherkennung) schlägt
 * Maschinenübersetzung, Deutsch schlägt andere Sprachen — bei Rezept-Videos steckt der
 * Inhalt fast immer in der gesprochenen Anleitung.
 */
export const rankSubtitleLinks = (rawLinks: unknown): Array<{ url: string; language: string }> => {
  if (!Array.isArray(rawLinks)) return [];

  return rawLinks
    .map((entry) => {
      const record = toRecord(entry);
      const url = typeof record?.downloadLink === "string" ? record.downloadLink : "";
      // Nur Apify-eigene Key-Value-Store-Links; keine signierten TikTok-CDN-URLs abrufen.
      if (!url.startsWith("https://api.apify.com/")) return null;

      const language = typeof record?.language === "string" ? record.language : "";
      const source = typeof record?.source === "string" ? record.source : "";
      const isGerman = /^(deu|ger)/i.test(language);
      return { url, language, rank: (source === "ASR" ? 2 : 0) + (isGerman ? 1 : 0) };
    })
    .filter((entry): entry is { url: string; language: string; rank: number } => entry !== null)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_SUBTITLE_TRACKS)
    .map(({ url, language }) => ({ url, language }));
};

/** WebVTT → Fließtext: Cue-Timings, Sequenznummern, Tags und Wiederholungen raus. */
export const vttToPlainText = (vtt: string): string => {
  const out: string[] = [];

  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === "WEBVTT") continue;
    if (line.includes("-->")) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) continue;

    const text = line.replace(/<[^>]+>/g, "").trim();
    if (!text || out[out.length - 1] === text) continue;
    out.push(text);
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
};
