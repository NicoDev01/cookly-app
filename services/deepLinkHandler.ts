import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Deep Link Handler für Capacitor-Apps
 *
 * Verarbeitet OAuth-Callbacks von Clerk.
 * Unterstützte Schemas:
 * - cooklyrecipe://oauth-callback
 * - com.cookly.recipe://sso-callback
 */

type NavigateFunction = (path: string) => void;

export function initDeepLinkHandler(navigate: NavigateFunction) {

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    console.log('[DeepLink] Received URL:', event.url);

    try {
      const url = new URL(event.url);

      // OAuth-Callback mit cooklyrecipe:// Schema
      if (url.protocol === 'cooklyrecipe:') {
        console.log('[DeepLink] OAuth callback (cooklyrecipe scheme) detected:', event.url);

        const searchParams = url.search || '';
        console.log('[DeepLink] Redirecting to /sso-callback' + searchParams);

        window.location.href = '/sso-callback' + searchParams;
        return;
      }

      // OAuth-Callback mit com.cookly.recipe:// Schema
      if (url.protocol === 'com.cookly.recipe:') {
        console.log('[DeepLink] OAuth callback (com.cookly.recipe scheme) detected:', event.url);

        const searchParams = url.search || '';
        console.log('[DeepLink] Redirecting to /sso-callback' + searchParams);

        window.location.href = '/sso-callback' + searchParams;
        return;
      }

      // OAuth-Callback - sso-callback host (HTTPS)
      if (url.host === 'sso-callback') {
        console.log('[DeepLink] OAuth callback (sso-callback host) detected:', event.url);

        const searchParams = url.search || '';
        console.log('[DeepLink] Redirecting to /sso-callback' + searchParams);

        window.location.href = '/sso-callback' + searchParams;
        return;
      }

      // Legacy OAuth-Callback (cooklyrecipe://auth)
      if (url.protocol === 'cooklyrecipe:' && url.host === 'auth') {
        console.log('[DeepLink] Legacy auth callback detected');
        const searchParams = url.search;
        window.location.href = '/sso-callback' + searchParams;
        return;
      }

      // Allgemeine Deep-Links
      const path = url.pathname || '/';
      navigate(path);
    } catch (err) {
      console.error('[DeepLink] Error parsing URL:', err, event.url);
    }
  });
}

export function removeDeepLinkHandler() {
  if (Capacitor.isNativePlatform()) {
    App.removeAllListeners();
  }
}
