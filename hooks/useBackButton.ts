import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App } from '@capacitor/app';
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
 * 5. Root (Kategorien) → Double-Tap → EXIT
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
  const lastBackPress = useRef(0);

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

  // Haupt-Handler für den Back Button
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const setupHandler = async () => {
      const handle = await App.addListener('backButton', () => {
        const currentPath = location.pathname;

        // 1. HÖCHSTE PRIORITÄT: Modal schließen
        if (isAnyModalOpen) {
          closeModals();
          return;
        }

        // 2. RecipePage → Historische Navigation
        if (currentPath.startsWith('/recipe/')) {
          const handled = handleHistoricalBack();
          if (handled) return;
          navigate('/tabs/categories');
          return;
        }

        // 3. Root (Kategorien) → Double-Tap-to-Exit
        if (currentPath === '/tabs/categories' || currentPath === '/') {
          const now = Date.now();
          if (now - lastBackPress.current < 2000) {
            App.exitApp();
          } else {
            lastBackPress.current = now;
          }
          return;
        }

        // 4. Standard Navigation zu Root
        handleStandardBack();
      });

      return handle;
    };

    const handlePromise = setupHandler();

    return () => {
      handlePromise.then((handle) => handle?.remove());
    };
  }, [isAnyModalOpen, location.pathname, handleHistoricalBack, handleStandardBack, navigate, closeModals]);
}
