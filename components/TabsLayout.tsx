import React, { Suspense, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AppNav from './AppNav';
import { OfflineBanner } from './OfflineBanner';
import { ErrorBoundary } from './ErrorBoundary';
import { useModal } from '../contexts/ModalContext';
import { prefetchAddRecipeModal, prefetchRecipeImages } from '../prefetch';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

// Lazy load pages
const CategoriesPage = React.lazy(() => import('../pages/CategoriesPage'));
const FavoritesPage = React.lazy(() => import('../pages/FavoritesPage'));
const WeeklyPage = React.lazy(() => import('../pages/WeeklyPage'));
const ShoppingPage = React.lazy(() => import('../pages/ShoppingPage'));
const ProfilePage = React.lazy(() => import('../pages/ProfilePage'));
const SubscribePage = React.lazy(() => import('../pages/SubscribePage'));

const AddRecipeModal = React.lazy(() => import('./AddRecipeModal'));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
    <div className="text-center">
      <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-text-secondary-light dark:text-text-secondary-dark">Lädt...</p>
    </div>
  </div>
);

/**
 * TabsLayout - Persistent container mit State Preservation für Tabs
 *
 * PERFORMANCE OPTIMIZATION (QW-1):
 * - Alle Tabs werden gleichzeitig gemountet
 * - Tab-Wechsel ist instant (keine neuen Queries nötig)
 * - Scroll-Position wird bei jedem Wechsel auf Top zurückgesetzt (gewünschtes Verhalten)
 * - Such-Text und Filter bleiben erhalten
 */
export const TabsLayout: React.FC = () => {
  const { isAddModalOpen, closeAddModal, openAddModal, isAnyModalOpen } = useModal();
  const location = useLocation();

  // Refs für Scroll-Reset bei Tab-Wechsel
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousTabRef = useRef<string | null>(null);

  // Prefetch all tab routes immediately on mount for instant tab switching
  React.useEffect(() => {
    Promise.all([
      import('../pages/CategoriesPage'),
      import('../pages/FavoritesPage'),
      import('../pages/WeeklyPage'),
      import('../pages/ShoppingPage'),
      import('../pages/ProfilePage'),
      import('../pages/SubscribePage'),
    ]);
  }, []);

  // Prefetch recipe images for instant visual feedback
  const recipes = useQuery(api.recipes.list, {});
  React.useEffect(() => {
    if (recipes && recipes.length > 0) {
      const imageUrls = recipes.map(r => r.image).filter(Boolean) as string[];
      prefetchRecipeImages(imageUrls);
    }
  }, [recipes]);

  const handleAddRecipe = () => {
    void prefetchAddRecipeModal();
    openAddModal();
  };

  // Scroll-Reset bei Tab-Wechsel (nicht für Outlet-Routen)
  React.useEffect(() => {
    const currentPath = location.pathname;
    const isTabRoute = currentPath.startsWith('/tabs/') && currentPath.split('/').length === 3;

    if (isTabRoute && previousTabRef.current !== currentPath) {
      // Scroll-Position des aktuellen Tabs auf Top zurücksetzen
      const currentTabRef = tabRefs.current[currentPath];
      if (currentTabRef) {
        currentTabRef.scrollTop = 0;
      }
      previousTabRef.current = currentPath;
    }
  }, [location.pathname]);

  // Tab-Route Definitionen
  const tabRoutes = [
    '/tabs/categories',
    '/tabs/favorites',
    '/tabs/weekly',
    '/tabs/shopping',
    '/tabs/profile',
    '/tabs/subscribe',
  ];

  const currentPath = location.pathname;
  const isTabRoute = tabRoutes.includes(currentPath);

  return (
    <ErrorBoundary>
      <div className="antialiased min-h-screen bg-background-light dark:bg-background-dark">
        <OfflineBanner />

        {/* Page Content */}
        <Suspense fallback={null}>
          {isTabRoute ? (
            /* TAB-ROUTEN: Alle Tabs mounten, aber nur den aktiven anzeigen */
            <div className="relative">
              {tabRoutes.map((tabPath) => (
                <div
                  key={tabPath}
                  ref={(el) => { tabRefs.current[tabPath] = el; }}
                  style={{
                    display: currentPath === tabPath ? 'block' : 'none',
                    // Scroll-Verhalten für Tabs
                    overflowY: 'auto',
                    height: '100vh',
                  }}
                  className="page-enter"
                >
                  {tabPath === '/tabs/categories' && <CategoriesPage />}
                  {tabPath === '/tabs/favorites' && <FavoritesPage />}
                  {tabPath === '/tabs/weekly' && <WeeklyPage />}
                  {tabPath === '/tabs/shopping' && <ShoppingPage />}
                  {tabPath === '/tabs/profile' && <ProfilePage />}
                  {tabPath === '/tabs/subscribe' && <SubscribePage />}
                </div>
              ))}
            </div>
          ) : (
            /* OUTLET-ROUTEN: category/:category, recipe/:id, etc. */
            <div key={currentPath} className="page-enter">
              <Outlet />
            </div>
          )}
        </Suspense>

        {/* Navigation */}
        {!isAnyModalOpen && <AppNav onAddRecipe={handleAddRecipe} />}

        {/* Add Recipe Modal */}
        {isAddModalOpen && (
          <Suspense fallback={null}>
            <AddRecipeModal
              isOpen={isAddModalOpen}
              onClose={closeAddModal}
            />
          </Suspense>
        )}
      </div>
    </ErrorBoundary>
  );
};

TabsLayout.displayName = 'TabsLayout';

export default TabsLayout;
