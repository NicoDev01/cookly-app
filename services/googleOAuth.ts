import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { api } from '../convex/_generated/api';
import { convexClient, convexUrl } from '../convexClient';

const CALLBACK_URL = 'com.cookly.recipe://auth-callback';
const VERIFIER_KEY = `__convexAuthOAuthVerifier_${convexUrl.replace(/[^a-zA-Z0-9]/g, '')}`;

export async function startNativeGoogleOAuth(): Promise<void> {
  localStorage.removeItem(VERIFIER_KEY);

  const result = await convexClient.action(api.auth.signIn, {
    provider: 'google',
    params: { redirectTo: CALLBACK_URL },
  });

  if (!result.redirect || !result.verifier) {
    throw new Error('Google OAuth konnte nicht gestartet werden.');
  }

  localStorage.setItem(VERIFIER_KEY, result.verifier);

  try {
    await Browser.open({ url: result.redirect });
  } catch (error) {
    localStorage.removeItem(VERIFIER_KEY);
    throw error;
  }
}

export const startGoogleOAuth = (webSignIn: () => Promise<unknown>): Promise<unknown> =>
  Capacitor.isNativePlatform() ? startNativeGoogleOAuth() : webSignIn();
