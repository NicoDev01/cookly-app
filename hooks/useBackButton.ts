import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

type NavState = {
  from?: 'favorites' | 'weekly';
  fromCategory?: string;
  nav?: {
    ids: string[];
    index?: number;
  };
};

/**
 * Native Android Back Button Handler für Cookly
 *
 * FIX: Listener wird EINMALIG registriert (mount-only).
 * Aktuelle Werte (location, isAnyModalOpen) werden über Refs gelesen.
 * Das verhindert die Endlosschleife von Listener-Remove/Add bei jeder Navigation.
 *
 * Navigation Hierarchy (Priority Order):
 * 1. MODAL OPEN → Close Modal (HIGHEST PRIORITY)
 * 2. RecipePage → Historisch zurück (favorites/weekly/category)
 * 3. Subscribe → Profil
 * 4. Other Tabs → Kategorien (Root)
 * 5. Root (Kategorien) → App minimieren (exitApp)
 */
export function useBackButton({
  isAnyModalOpen,
  closeModals,
}: {
  isAnyModalOpen: boolean;
  closeModals: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  // Refs für aktuelle Werte — werden im Listener-Callback gelesen
  const locationRef = useRef(location);
  const isAnyModalOpenRef = useRef(isAnyModalOpen);
  const closeModalsRef = useRef(closeModals);
  const navigateRef = useRef(navigate);

  // Refs bei jedem Render aktualisieren
  locationRef.current = location;
  isAnyModalOpenRef.current = isAnyModalOpen;
  closeModalsRef.current = closeModals;
  navigateRef.current = navigate;

  // Listener EINMALIG registrieren (mount-only)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let handler: { remove: () => void } | null = null;

    App.addListener('backButton', () => {
      // Haptisches Feedback
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});

      const loc = locationRef.current;
      const nav = navigateRef.current;
      const modalOpen = isAnyModalOpenRef.current;
      const closeModalsFn = closeModalsRef.current;

      // 1. HÖCHSTE PRIORITÄT: Modal schließen
      if (modalOpen) {
        closeModalsFn();
        return;
      }

      // 2. RecipePage → Historische Navigation
      if (loc.pathname.startsWith('/recipe/')) {
        const state = loc.state as NavState;

        if (state?.from === 'favorites') {
          nav('/tabs/favorites');
          return;
        }
        if (state?.from === 'weekly') {
          nav('/tabs/weekly');
          return;
        }
        if (state?.fromCategory) {
          nav(`/category/${encodeURIComponent(state.fromCategory)}`);
          return;
        }

        nav('/tabs/categories');
        return;
      }

      // 3. ROOT PAGE → App minimieren
      const isRootPage = loc.pathname === '/tabs/categories' || loc.pathname === '/';
      if (isRootPage) {
        App.minimizeApp().catch(() => {
          App.exitApp();
        });
        return;
      }

      // 4. Standard Navigation zu Root
      // SUBSCRIBE → Profil
      if (loc.pathname.startsWith('/tabs/subscribe')) {
        nav('/tabs/profile');
        return;
      }

      // ALLE ANDEREN → Kategorien
      nav('/tabs/categories');
    }).then((h) => {
      handler = h;
    });

    // Cleanup NUR bei Unmount
    return () => {
      handler?.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
