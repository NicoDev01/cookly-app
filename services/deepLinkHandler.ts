import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { logger } from '../utils/logger';

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
    logger.debug('DeepLink', 'Handler already initialized, skipping');
    return;
  }

  App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    logger.debug('DeepLink', 'appUrlOpen fired', { url: event.url });

    // Externen Browser schließen (wurde für Google OAuth geöffnet)
    Browser.close().catch(() => {});

    try {
      const url = new URL(event.url);

      // Convex Auth OAuth Callback
      const isAuthCallback =
        url.host === 'auth-callback' ||
        url.pathname?.includes('auth-callback');

      if (isAuthCallback) {
        logger.debug('DeepLink', 'Convex Auth callback detected');
        // Alle Query-Parameter weiterleiten
        const params = url.search || '';
        navigate(`/auth-callback${params}`);
        return;
      }

      // Allgemeine Deep-Links
      const path = url.pathname || '/';
      logger.debug('DeepLink', 'General deep link, navigating', { path });
      navigate(path);
    } catch (err) {
      logger.error('DeepLink', 'Error parsing URL', { err, url: event.url });
    }
  }).then((handle) => {
    appUrlOpenHandle = handle;
  });
}

export function removeDeepLinkHandler() {
  if (appUrlOpenHandle) {
    appUrlOpenHandle.remove();
    appUrlOpenHandle = null;
    logger.debug('DeepLink', 'Handler removed');
  }
}
