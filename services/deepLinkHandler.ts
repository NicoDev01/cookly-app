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

      // Share Target Deep Link (z.B. cookly://share-target?url=... oder com.cookly.recipe://share-target?url=...)
      const isShareTarget =
        url.host === 'share-target' ||
        url.pathname?.includes('share-target');

      if (isShareTarget) {
        logger.debug('DeepLink', 'Share target detected');
        const params = url.search || '';
        navigate(`/share-target${params}`);
        return;
      }

      // Allgemeine Deep-Links
      let targetPath = '/';
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        targetPath = `${url.pathname || '/'}${url.search || ''}`;
      } else {
        // Custom URL Scheme (z.B. cookly://recipes/123)
        const hostAndPath = url.host ? `/${url.host}${url.pathname || ''}` : (url.pathname || '/');
        targetPath = `${hostAndPath}${url.search || ''}`;
      }

      logger.debug('DeepLink', 'General deep link, navigating', { targetPath });
      navigate(targetPath);
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
