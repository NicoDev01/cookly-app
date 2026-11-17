/**
 * Öffentliche Instagram-Einbettungsseite (`/p/<shortcode>/embed/captioned/`) auslesen: Caption und Vorschaubild.
 * Instagram liefert entweder strukturierte Daten (`contextJSON` → `gql_data.shortcode_media`) oder nur das
 * gerenderte HTML (`contextJSON: null`); beide Fälle werden gelesen (gemessen 2026-11-17: 18 von 18 Beiträgen).
 */

export type InstagramEmbedData = { shortcode: string; caption: string; imageUrl?: string };

const MAX_CAPTION_LENGTH = 8000;

export const isInstagramCdnUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host.endsWith(".cdninstagram.com") || host.endsWith(".fbcdn.net"));
  } catch {
    return false;
  }
};

const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const cleanCaption = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CAPTION_LENGTH);

/** Wert des JSON-String-Literals direkt nach `"contextJSON":` (selbst wieder JSON), sonst null. */
const readContextJson = (html: string): Record<string, unknown> | null => {
  const marker = '"contextJSON":"';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  let end = start + marker.length;
  for (let escaped = false; end < html.length; end++) {
    const char = html[end];
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === '"') break;
  }
  try {
    const parsed = JSON.parse(JSON.parse(html.slice(start + marker.length - 1, end + 1)));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const fromContextJson = (html: string, shortcode: string): InstagramEmbedData | null => {
  const media = (readContextJson(html)?.gql_data as { shortcode_media?: Record<string, any> } | undefined)?.shortcode_media;
  if (!media || media.shortcode !== shortcode) return null;
  const caption = cleanCaption(String(media.edge_media_to_caption?.edges?.[0]?.node?.text ?? ""));
  if (!caption) return null;
  const imageUrl = [media.display_url, media.thumbnail_src].find(isInstagramCdnUrl);
  return { shortcode, caption, imageUrl };
};

const fromHtml = (html: string, shortcode: string): InstagramEmbedData | null => {
  // Ohne strukturierte Daten: Die Seite muss zu genau diesem Beitrag gehören.
  if (!html.includes(`/p/${shortcode}/`) && !html.includes(`\\/p\\/${shortcode}\\/`)) return null;
  const block = html.match(/<div class="Caption">([\s\S]*?)<div class="CaptionComments/)?.[1];
  if (!block) return null;
  const caption = cleanCaption(
    decodeEntities(
      block
        .replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    ),
  );
  if (!caption) return null;
  const src = html.match(/<img class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/)?.[1];
  const imageUrl = src ? decodeEntities(src) : undefined;
  return { shortcode, caption, imageUrl: isInstagramCdnUrl(imageUrl) ? imageUrl : undefined };
};

export function parseInstagramEmbedPage(html: string, expectedShortcode: string): InstagramEmbedData | null {
  if (!html || !expectedShortcode) return null;
  return fromContextJson(html, expectedShortcode) ?? fromHtml(html, expectedShortcode);
}
