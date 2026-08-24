export type ImportProvider = 'instagram' | 'facebook' | 'tiktok' | 'website';

export type ImportTarget = {
  provider: ImportProvider;
  url: string;
};

/**
 * Reihenfolge ist bedeutsam: Die spezifischen Plattform-Muster müssen vor dem
 * generischen URL-Fallback greifen, sonst landet z. B. ein TikTok-Link beim
 * Website-Import (Jina), der ihn nicht lesen kann.
 */
const PLATFORM_PATTERNS: ReadonlyArray<{ provider: Exclude<ImportProvider, 'website'>; pattern: RegExp }> = [
  {
    provider: 'instagram',
    pattern: /https?:\/\/(?:(?:www|m)\.)?instagram\.com\/(?:p\/[A-Za-z0-9_-]+|reel\/[A-Za-z0-9_-]+|share\/(?:p|reel)\/[A-Za-z0-9_-]+)[^\s]*/i,
  },
  {
    // vm./vt. sind die Kurzlinks, die die TikTok-App beim Teilen erzeugt.
    provider: 'tiktok',
    pattern: /https?:\/\/(?:(?:www|m|vm|vt)\.)?tiktok\.com\/[^\s]+/i,
  },
  {
    provider: 'facebook',
    pattern: /https?:\/\/(?:(?:www|m)\.)?(?:facebook\.com|fb\.watch)\/[^\s]+/i,
  },
];

const GENERIC_URL_PATTERN = /(https?:\/\/[^\s]+)/;

/** Ermittelt aus dem geteilten Text (Titel + Beschreibung + URL) das Import-Ziel. */
export const detectImportTarget = (sharedText: string): ImportTarget | null => {
  for (const { provider, pattern } of PLATFORM_PATTERNS) {
    const match = sharedText.match(pattern);
    if (match) return { provider, url: match[0] };
  }

  const generic = sharedText.match(GENERIC_URL_PATTERN);
  return generic ? { provider: 'website', url: generic[1] } : null;
};
