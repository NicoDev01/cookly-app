import { Capacitor, registerPlugin } from '@capacitor/core';
import { convexUrl } from '../convexClient';
import { logger } from '../utils/logger';
import { convexSiteUrl, needsShareTokenRefresh, type ShareAuthState } from '../utils/shareAuth';

/**
 * Import-Zugang für das Teilen-Overlay (ios/App/CooklyShare). Die App stellt pro Gerät einen Token aus
 * (convex/shareTokens.ts) und legt ihn per ShareAuthPlugin in den gemeinsamen Keychain.
 * Nur iOS; ohne Token öffnet die Extension wie bisher die App.
 */
type ShareAuthPlugin = {
  getState(): Promise<ShareAuthState>;
  setToken(options: { token: string; apiBase: string; userId: string; issuedAt: number; expiresAt: number }): Promise<void>;
  clearToken(): Promise<void>;
};

const ShareAuth = registerPlugin<ShareAuthPlugin>('ShareAuth');

const isAvailable = () => Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('ShareAuth');

type IssueToken = (args: { installationId: string }) => Promise<{ token: string; expiresAt: number }>;
type RevokeToken = (args: { installationId: string }) => Promise<unknown>;

/** Nach Login und App-Start: Token ausstellen, wenn keiner da ist, er zu einem anderen Konto gehört oder alt ist. */
export async function ensureShareToken(userId: string, issue: IssueToken): Promise<void> {
  if (!isAvailable()) return;
  const apiBase = convexSiteUrl(convexUrl);
  if (!apiBase) return;
  try {
    const state = await ShareAuth.getState();
    if (!needsShareTokenRefresh(state, userId, apiBase, Date.now())) return;
    const { token, expiresAt } = await issue({ installationId: state.installationId });
    await ShareAuth.setToken({ token, apiBase, userId, issuedAt: Date.now(), expiresAt });
  } catch (error: unknown) {
    // Offline oder Server nicht erreichbar: nächster App-Start versucht es erneut, Teilen öffnet so lange die App.
    logger.info('ShareAuth', 'Token not refreshed', error);
  }
}

/** Abmelden und Konto löschen: Token auf dem Server widerrufen (best effort) und lokal immer löschen. */
export async function revokeShareToken(revoke: RevokeToken): Promise<void> {
  if (!isAvailable()) return;
  try {
    const state = await ShareAuth.getState();
    if (state.hasToken) await revoke({ installationId: state.installationId });
  } catch (error: unknown) {
    logger.info('ShareAuth', 'Server revoke failed', error);
  }
  await clearShareToken();
}

export async function clearShareToken(): Promise<void> {
  if (!isAvailable()) return;
  try {
    await ShareAuth.clearToken();
  } catch (error: unknown) {
    logger.warn('ShareAuth', 'Clearing token failed', error);
  }
}
