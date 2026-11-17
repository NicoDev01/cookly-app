/** Reine Regeln für den Import-Zugang der iOS-Share-Extension (services/shareAuth.ts). */

export type ShareAuthState = {
  installationId: string;
  hasToken: boolean;
  userId?: string;
  apiBase?: string;
  issuedAt?: number;
};

/** Token wird nach 30 Tagen erneuert; der Server lässt ihn 90 Tage gleitend laufen (convex/lib/shareImport.ts). */
export const SHARE_TOKEN_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

/** HTTP-Routen liegen bei Convex unter .convex.site, der Client spricht .convex.cloud. */
export const convexSiteUrl = (convexUrl: string | undefined): string | null => {
  if (!convexUrl) return null;
  const match = /^https:\/\/([a-z0-9-]+)\.convex\.cloud\/?$/i.exec(convexUrl.trim());
  return match ? `https://${match[1]}.convex.site` : null;
};

export const needsShareTokenRefresh = (
  state: ShareAuthState,
  userId: string,
  apiBase: string,
  now: number,
): boolean =>
  !state.hasToken ||
  state.userId !== userId ||
  state.apiBase !== apiBase ||
  typeof state.issuedAt !== 'number' ||
  now - state.issuedAt > SHARE_TOKEN_REFRESH_MS;
