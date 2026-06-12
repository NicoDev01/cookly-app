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
