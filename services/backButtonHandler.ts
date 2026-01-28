import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NavigateFunction } from 'react-router-dom';

let backButtonCleanup: (() => void) | null = null;

/**
 * Vereinfachte Back-Button Logik für Cookly Mobile App
 *
 * Navigation Hierarchy:
 * - Kategorien (/tabs/categories) = Root / Startseite
 * - Tabs (Favoriten, Woche, Einkauf, Profil) → Immer zu Kategorien
 * - Subscribe → Profil → Kategorien
 * - Category/Recipe → Layer für Layer zurück
 *
 * @param navigate React Router navigate function
 */
export function initBackButtonHandler(navigate: NavigateFunction) {
  // Only on native platform (Android Capacitor)
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  let lastBackPress = 0;

  const setupHandler = async () => {
    const handle = await App.addListener('backButton', () => {
      const now = Date.now();
      const currentPath = window.location.pathname;

      // Bestimme das Ziel basierend auf aktuellem Pfad
      const targetPath = getBackTarget(currentPath);

      if (targetPath === 'EXIT') {
        // Double-Tap-to-Exit auf Kategorieseite (2 Sekunden Fenster)
        if (now - lastBackPress < 2000) {
          App.exitApp();
        } else {
          lastBackPress = now;
        }
      } else {
        // Navigation zum Ziel
        navigate(targetPath);
      }
    });

    backButtonCleanup = () => {
      handle.remove();
    };
  };

  setupHandler();
}

/**
 * Bestimmt das Ziel für den Back Button basierend auf aktuellem Pfad
 *
 * Navigation Hierarchy:
 * - Kategorien (/tabs/categories) = Root → EXIT
 * - Tabs (Favoriten, Woche, Einkauf, Profil) → Kategorien
 * - Subscribe → Profil → Kategorien
 * - Category/Recipe → Kategorien (Fallback)
 *
 * @returns Ziel-Pfad oder 'EXIT' für App-Beenden
 */
export function getBackTarget(currentPath: string): string | 'EXIT' {
  // TAB PAGES → Immer zu Kategorien
  if (isTabPath(currentPath)) {
    return '/tabs/categories';
  }

  // SUBSCRIBE → Zurück zu Profil
  if (currentPath.startsWith('/tabs/subscribe')) {
    return '/tabs/profile';
  }

  // SUB PAGES → Standard navigate(-1) (wird vom Aufrufer behandelt)
  if (currentPath.startsWith('/category/') || currentPath.startsWith('/recipe/')) {
    return '/tabs/categories'; // Fallback: Immer zu Kategorien
  }

  // KATEGORIEN (Root) → App schließen
  if (currentPath === '/tabs/categories' || currentPath === '/') {
    return 'EXIT';
  }

  // Default Fallback
  return '/tabs/categories';
}

/**
 * Prüft ob der Pfad eine Tab-Seite ist (außer Kategorien)
 */
function isTabPath(path: string): boolean {
  const tabPaths = [
    '/tabs/favorites',
    '/tabs/weekly',
    '/tabs/shopping',
    '/tabs/profile',
  ];

  return tabPaths.some(tabPath => path.startsWith(tabPath));
}

export function removeBackButtonHandler() {
  if (backButtonCleanup) {
    backButtonCleanup();
    backButtonCleanup = null;
  }
}
