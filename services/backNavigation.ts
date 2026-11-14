import type { NavigateFunction } from 'react-router-dom';

/**
 * Pure route mapping for UI back buttons.
 *
 * Native Capacitor listener registration lives only in hooks/useBackButton.ts.
 */
export function getBackTarget(currentPath: string): string | 'EXIT' {
  if (currentPath === '/tabs/categories' || currentPath === '/') {
    return 'EXIT';
  }

  if (currentPath.startsWith('/tabs/subscribe')) {
    return '/tabs/profile';
  }

  if (isTabPath(currentPath)) {
    return '/tabs/categories';
  }

  if (currentPath.startsWith('/category/') || currentPath.startsWith('/recipe/')) {
    return '/tabs/categories';
  }

  return '/tabs/categories';
}

function isTabPath(path: string): boolean {
  const tabPaths = [
    '/tabs/favorites',
    '/tabs/weekly',
    '/tabs/shopping',
    '/tabs/profile',
  ];

  return tabPaths.some((tabPath) => path.startsWith(tabPath));
}

export type BackNavState = { from?: 'favorites' | 'weekly'; fromCategory?: string } | null | undefined;

/** Ziel von "Zurück" inkl. Herkunft aus dem Navigations-State (Favoriten, Wochenplan, Kategorie). */
export function backTargetFor(pathname: string, state: BackNavState): string {
  if (state?.from === 'favorites') return '/tabs/favorites';
  if (state?.from === 'weekly') return '/tabs/weekly';
  if (state?.fromCategory) return `/category/${encodeURIComponent(state.fromCategory)}`;
  const target = getBackTarget(pathname);
  return target === 'EXIT' ? '/tabs/categories' : target;
}

/**
 * Pfad je Verlaufsindex (React Router legt `idx` in history.state ab). Damit kann "Zurück" echt zurückgehen,
 * wenn der vorige Eintrag das Ziel ist, statt einen neuen Eintrag anzuhängen: Der Verlauf wächst nicht endlos.
 */
const pathsByIndex = new Map<number, string>();
const normalize = (path: string) => {
  try { return decodeURIComponent(path); } catch { return path; }
};

export function recordHistoryEntry(index: unknown, path: string) {
  if (typeof index === 'number' && Number.isInteger(index)) pathsByIndex.set(index, normalize(path));
}

/** `navigate(-1)`, wenn der vorige Eintrag `target` ist; sonst `target` anstelle des aktuellen Eintrags. */
export function navigateBack(navigate: NavigateFunction, target: string, index: unknown) {
  if (typeof index === 'number' && index > 0 && pathsByIndex.get(index - 1) === normalize(target)) {
    navigate(-1);
    return;
  }
  navigate(target, { replace: true });
}
