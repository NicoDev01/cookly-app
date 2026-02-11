import { useEffect, useCallback } from 'react';
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
 * Navigation Hierarchy (Priority Order):
 * 1. MODAL OPEN → Close Modal (HIGHEST PRIORITY)
 * 2. RecipePage → Historisch zurück (favorites/weekly/category)
 * 3. Subscribe → Profil
 * 4. Other Tabs → Kategorien (Root)
 * 5. Root (Kategorien) → App minimieren (exitApp)
 *
 * @param isAnyModalOpen - Zustand ob ein Modal offen ist
 * @param closeModals - Function um alle Modals zu schließen
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

  // Prüfung: Sind wir auf der Root Page?
  const isRootPage = () => {
    return location.pathname === '/tabs/categories' || location.pathname === '/';
  };

  // Historische Back-Navigation (für RecipePage)
  const handleHistoricalBack = useCallback(() => {
    const state = location.state as NavState;

    // Von Favorites/Weekly gekommen? → Dorthin zurück
    if (state?.from === 'favorites') {
      navigate('/tabs/favorites');
      return true;
    }
    if (state?.from === 'weekly') {
      navigate('/tabs/weekly');
      return true;
    }

    // Von Kategorie gekommen? → Dorthin zurück
    if (state?.fromCategory) {
      navigate(`/category/${encodeURIComponent(state.fromCategory)}`);
      return true;
    }

    return false; // Kein historischer Context
  }, [navigate, location.state]);

  // Standard Back-Navigation (alle andere Pages)
  const handleStandardBack = useCallback(() => {
    const currentPath = location.pathname;

    // SUBSCRIBE → Profil
    if (currentPath.startsWith('/tabs/subscribe')) {
      navigate('/tabs/profile');
      return true;
    }

    // ALLE ANDEREN TABS/ROUTES → Kategorien (Root)
    navigate('/tabs/categories');
    return true;
  }, [navigate, location.pathname]);

  // Haptisches Feedback bei Back Press
  const triggerHapticFeedback = useCallback(() => {
    if (!Capacitor.isNativePlatform()) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
      // Ignore haptic errors (optional feature)
    });
  }, []);

  // Haupt-Handler für den Back Button
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const setupHandler = async () => {
      const handler = await App.addListener('backButton', () => {
        // Haptisches Feedback
        triggerHapticFeedback();

        // 1. HÖCHSTE PRIORITÄT: Modal schließen
        if (isAnyModalOpen) {
          closeModals();
          return;
        }

        // 2. RecipePage → Historische Navigation
        if (location.pathname.startsWith('/recipe/')) {
          const handled = handleHistoricalBack();
          if (handled) return;
          navigate('/tabs/categories');
          return;
        }

        // 3. ROOT PAGE → App minimieren (nicht beenden!)
        // Wir prüfen den Pfad direkt, NICHT canGoBack (weil navigate() die Browser History nicht korrekt aktualisiert)
        if (isRootPage()) {
          // minimizeApp() nur auf Android verfügbar - hält die App im Speicher
          App.minimizeApp().catch(() => {
            // Fallback: Falls minimizeApp nicht verfügbar (iOS), exitApp verwenden
            App.exitApp();
          });
          return;
        }

        // 4. Standard Navigation zu Root
        handleStandardBack();
      });

      return handler;
    };

    const handlePromise = setupHandler();

    return () => {
      handlePromise.then((handle) => handle?.remove());
    };
  }, [isAnyModalOpen, location, handleHistoricalBack, handleStandardBack, navigate, closeModals, triggerHapticFeedback]);
}
