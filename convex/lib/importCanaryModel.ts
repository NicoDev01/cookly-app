/** Reine Logik für den stündlichen Kontroll-Check der Import-Schnellwege (convex/importCanary.ts). */

export const CANARY_PLATFORMS = ["instagram", "tiktok"] as const;
export type CanaryPlatform = (typeof CANARY_PLATFORMS)[number];

const SAMPLES_PER_PLATFORM = 3;
const MIN_SAMPLES = 2;

/** Die jüngsten öffentlich importierten Beiträge je Plattform (aus dem Import-Cache, ohne Nutzerbezug). */
export function pickCanarySamples(entries: Array<{ key: string; provider: string }>): Record<CanaryPlatform, string[]> {
  const samples: Record<CanaryPlatform, string[]> = { instagram: [], tiktok: [] };
  for (const { key, provider } of entries) {
    if (!(CANARY_PLATFORMS as readonly string[]).includes(provider)) continue;
    const list = samples[provider as CanaryPlatform];
    const id = key.slice(provider.length + 1);
    if (key.startsWith(`${provider}:`) && id && list.length < SAMPLES_PER_PLATFORM && !list.includes(id)) list.push(id);
  }
  return samples;
}

/**
 * Ausgefallen gilt eine Plattform erst, wenn ALLE geprüften Beiträge scheitern (ein einzelner gelöschter Beitrag
 * ist kein Ausfall) und mindestens zwei geprüft wurden.
 */
export function failingPlatforms(results: Record<CanaryPlatform, boolean[]>): CanaryPlatform[] {
  return CANARY_PLATFORMS.filter((platform) => {
    const checks = results[platform];
    return checks.length >= MIN_SAMPLES && checks.every((ok) => !ok);
  });
}
