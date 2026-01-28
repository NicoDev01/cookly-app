import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useConvexAuth } from 'convex/react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { prefetchAddRecipeModal } from '../prefetch';
import {
  prefetchCategoriesPage,
  prefetchFavoritesPage,
  prefetchWeeklyPage,
  prefetchShoppingPage,
  prefetchProfilePage,
} from '../prefetch';
import { useHaptic } from '../hooks/useHaptic';

// Routes that should SHOW the navigation bar
const VISIBLE_NAV_PREFIXES = [
  '/tabs/',
  '/category/',
];

const shouldShowNav = (pathname: string): boolean => {
  return VISIBLE_NAV_PREFIXES.some(prefix => pathname.startsWith(prefix));
};

const AppNav: React.FC<{
  onAddRecipe: () => void;
}> = ({ onAddRecipe }) => {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser);
  const { impact } = useHaptic();

  const isActive = (path: string) => location.pathname === path;

  const intentHandlers = (prefetch: () => Promise<unknown>) => ({
    onPointerEnter: () => { void prefetch(); },
    onFocus: () => { void prefetch(); },
    onTouchStart: () => { void prefetch(); },
  });

  const handleNavTap = () => {
    void impact('light');
  };

  // Nav items with new /tabs/* routes
  const navItems = [
    { path: '/tabs/categories', icon: 'widgets', label: 'Kategorien', prefetch: prefetchCategoriesPage },
    { path: '/tabs/favorites', icon: 'favorite', label: 'Favoriten', prefetch: prefetchFavoritesPage },
    { path: '/tabs/weekly', icon: 'calendar_month', label: 'Woche', prefetch: prefetchWeeklyPage },
    { path: '/tabs/shopping', icon: 'shopping_cart', label: 'Einkauf', prefetch: prefetchShoppingPage },
    { path: '/tabs/profile', icon: 'person', label: 'Profil', prefetch: prefetchProfilePage },
  ];

  // Don't render if not on a nav route
  if (!shouldShowNav(location.pathname)) {
    return null;
  }

  // Don't show FAB if not authenticated or loading
  const showFab = isAuthenticated && !isLoading && currentUser;

  const handleAddRecipe = () => {
    void impact('medium');
    onAddRecipe();
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-lg border-t border-t-black/5 dark:border-t-white/5"
      style={{
        paddingBottom: 'var(--safe-area-inset-bottom, 0px)',
        transform: 'translateZ(0)',
      }}
    >
      {/* FAB - positioned above nav bar using absolute positioning to stay outside the bar's padding */}
      {showFab && (
        <div className="absolute right-4 bottom-[calc(100%+8px)]">
          <button
            onPointerEnter={() => { void prefetchAddRecipeModal(); }}
            onFocus={() => { void prefetchAddRecipeModal(); }}
            onTouchStart={() => { void prefetchAddRecipeModal(); }}
            onClick={handleAddRecipe}
            className="touch-btn flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg elevation-3"
            style={{
              transform: 'translateZ(0)',
              willChange: 'transform',
            }}
          >
            <span className="material-symbols-outlined text-2xl">add</span>
          </button>
        </div>
      )}

      {/* Bottom Nav Bar Content */}
      <div className="flex justify-around items-center px-2 pb-2 pt-1">
        {navItems.map(({ path, icon, label, prefetch }) => (
          <Link
            key={path}
            to={path}
            {...intentHandlers(prefetch)}
            onClick={handleNavTap}
            className={`touch-scale flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[56px] rounded-xl transition-colors duration-200 ${
              isActive(path)
                ? 'text-text-primary-light dark:text-text-primary-dark'
                : 'text-text-secondary-light dark:text-text-secondary-dark'
            }`}
          >
            <div className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200 ${
              isActive(path) ? 'bg-primary shadow-neo-light-convex dark:shadow-neo-dark-convex' : ''
            }`}>
              <span
                className={`material-symbols-outlined transition-all duration-200 ${isActive(path) ? 'filled text-white' : ''}`}
                style={{ fontSize: '22px' }}
              >
                {icon}
              </span>
            </div>
            <p className={`text-[10px] font-medium leading-tight transition-colors duration-200 ${isActive(path) ? 'text-primary' : ''}`}>
              {label}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AppNav;
