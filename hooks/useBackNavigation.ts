import { useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { backTargetFor, navigateBack, recordHistoryEntry, type BackNavState } from '../services/backNavigation';

const historyIndex = () => (window.history.state as { idx?: number } | null)?.idx;

/** Merkt sich den Pfad jedes Verlaufseintrags; einmal innerhalb des Routers mounten. */
export function useHistoryTracking() {
  const location = useLocation();
  useEffect(() => {
    recordHistoryEntry(historyIndex(), location.pathname);
  }, [location.key, location.pathname]);
}

/**
 * "Zurück" für UI-Buttons und die Wischgeste. Ziel nach Herkunft (Favoriten, Wochenplan, Kategorie,
 * sonst Hierarchie aus getBackTarget). Ist der vorige Verlaufseintrag genau dieses Ziel, geht es echt zurück.
 */
export function useBackNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    navigateBack(navigate, backTargetFor(location.pathname, location.state as BackNavState), historyIndex());
  }, [navigate, location.pathname, location.state]);
}
