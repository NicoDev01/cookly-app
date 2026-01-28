import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBackTarget } from '../services/backButtonHandler';

type NavState = {
  from?: 'favorites' | 'weekly';
  fromCategory?: string;
};

/**
 * Reusable Hook für konsistente Back-Button Logik in UI-Komponenten
 *
 * Navigation Hierarchy:
 * - Tab-Seiten → Kategorien
 * - Subscribe → Profil
 * - RecipePage → Berücksichtigt Herkunft:
 *   - from: 'favorites' → /tabs/favorites
 *   - from: 'weekly' → /tabs/weekly
 *   - fromCategory: 'all' → /category/all
 *   - fromCategory: 'Asiatisch' → /category/Asiatisch
 *   - Kein State → Fallback zu /tabs/categories
 * - CategoryPage → Kategorien
 *
 * @returns handleBack function die von onClick Handlers aufgerufen werden kann
 */
export function useBackNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = useCallback(() => {
    const state = location.state as NavState;

    // 1. Prüfen ob wir von Favorites/Weekly kommen
    if (state?.from === 'favorites') {
      navigate('/tabs/favorites');
      return;
    }
    if (state?.from === 'weekly') {
      navigate('/tabs/weekly');
      return;
    }

    // 2. Prüfen ob wir von einer Kategorie kommen
    if (state?.fromCategory) {
      navigate(`/category/${encodeURIComponent(state.fromCategory)}`);
      return;
    }

    // 3. Fallback zur Standard-Logik
    const target = getBackTarget(location.pathname);

    if (target === 'EXIT') {
      // Im UI sollten wir nie EXIT erreichen (nur native Back-Button)
      // Als Fallback navigieren wir zu Kategorien
      navigate('/tabs/categories');
    } else {
      navigate(target);
    }
  }, [navigate, location.pathname, location.state]);

  return handleBack;
}
