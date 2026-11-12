/** Reine Entscheidungslogik für das Pflicht-Update (ohne Capacitor), damit sie testbar bleibt. */

/** Vergleicht „1.5.10“ mit „1.5.9“ numerisch. Ungültige Teile zählen als 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/** Werte wie AppUpdateAvailability aus @capawesome/capacitor-app-update. */
const UPDATE_AVAILABLE = 2;
const UPDATE_IN_PROGRESS = 3;

export type StoreInfo = {
  currentVersionName?: string;
  availableVersionName?: string;
  updateAvailability?: number;
};

/** Bietet der Store diesem Gerät schon eine neuere Version an? Sonst würde der Button ins Leere führen. */
export function storeOffersUpdate(platform: string, info: StoreInfo): boolean {
  if (platform === 'android') {
    return info.updateAvailability === UPDATE_AVAILABLE || info.updateAvailability === UPDATE_IN_PROGRESS;
  }
  if (platform === 'ios') {
    return !!info.availableVersionName && !!info.currentVersionName && compareVersions(info.availableVersionName, info.currentVersionName) > 0;
  }
  return false;
}

/**
 * Pflicht-Update nur, wenn die installierte Version unter der Mindestversion liegt
 * UND der Store das Update anbietet (Play-Rollout bzw. App-Store-Freigabe kann nachhängen).
 */
export function isUpdateRequired(platform: string, minVersion: string | null | undefined, info: StoreInfo): boolean {
  if (!minVersion || !info.currentVersionName) return false;
  if (compareVersions(info.currentVersionName, minVersion) >= 0) return false;
  return storeOffersUpdate(platform, info);
}
