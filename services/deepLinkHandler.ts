import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export function initDeepLinkHandler(navigate: (path: string) => void) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    const url = new URL(event.url);
    
    if (url.protocol === 'cookly:' || url.host === 'cookly.app') {
      const path = url.pathname || '/';
      navigate(path);
    }
  });
}

export function removeDeepLinkHandler() {
  if (Capacitor.isNativePlatform()) {
    App.removeAllListeners();
  }
}
