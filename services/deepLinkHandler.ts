import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Deep Link Handler für Capacitor-Apps
 *
 * Verarbeitet OAuth-Callbacks von Clerk.
 * Bei sso-callback wird window.location.href verwendet, damit die URL-Parameter
 * an die SSOCallbackPage weitergegeben werden.
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

      // OAuth-Callback - alle sso-callback Varianten
      if (url.host === 'sso-callback') {
        console.log('[DeepLink] OAuth callback detected:', event.url);

        // Query-Parameter aus dem Deep Link extrahieren
        const searchParams = url.search || '';
        console.log('[DeepLink] Redirecting to /sso-callback' + searchParams);

        // window.location.href statt navigate() damit URL-Parameter erhalten bleiben
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
