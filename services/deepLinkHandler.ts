import { App, URLOpenListenerEvent, PluginListenerHandle } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/**
 * Deep Link Handler für Capacitor-Apps
 *
 * Verarbeitet OAuth-Callbacks von Convex Auth (Google OAuth).
 * Unterstütztes Schema: com.cookly.recipe://auth-callback
 */

type NavigateFunction = (path: string) => void;

let appUrlOpenHandle: PluginListenerHandle | null = null;

export function initDeepLinkHandler(navigate: NavigateFunction) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // Guard: Verhindere doppelte Initialisierung
  if (appUrlOpenHandle) {
    console.log('[DeepLink] Handler already initialized, skipping');
    return;
  }

  App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    console.log('[DeepLink] ===== appUrlOpen fired =====');
    console.log('[DeepLink] Raw URL:', event.url);

    // Externen Browser schließen (wurde für Google OAuth geöffnet)
    Browser.close().catch(() => {});

    try {
      const url = new URL(event.url);

      // Convex Auth OAuth Callback
      const isAuthCallback =
        url.host === 'auth-callback' ||
        url.pathname?.includes('auth-callback');

      if (isAuthCallback) {
        console.log('[DeepLink] Convex Auth callback detected');
        // Alle Query-Parameter weiterleiten
        const params = url.search || '';
        navigate(`/auth-callback${params}`);
        return;
      }

      // Allgemeine Deep-Links
      const path = url.pathname || '/';
      console.log('[DeepLink] General deep link, navigating to:', path);
      navigate(path);
    } catch (err) {
      console.error('[DeepLink] Error parsing URL:', err, event.url);
    }
  }).then((handle) => {
    appUrlOpenHandle = handle;
  });
}

export function removeDeepLinkHandler() {
  if (appUrlOpenHandle) {
    appUrlOpenHandle.remove();
    appUrlOpenHandle = null;
    console.log('[DeepLink] Handler removed');
  }
}
