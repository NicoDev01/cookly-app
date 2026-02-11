import React, { Suspense, useRef, useState } from 'react';
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
const CategoryRecipesPage = React.lazy(() => import('../pages/CategoryRecipesPage'));

const AddRecipeModal = React.lazy(() => import('./AddRecipeModal'));

// Wrapper component to provide params to cached CategoryRecipesPage
const CategoryRecipesWrapper: React.FC<{ category: string }> = ({ category }) => {
  return <CategoryRecipesPage key={category} category={category} />;
};

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

  // PERFORMANCE: Tracke besuchte Kategorien für State Preservation
  const [visitedCategories, setVisitedCategories] = useState<Set<string>>(new Set());

  // Prefetch all tab routes immediately on mount for instant tab switching
  React.useEffect(() => {
    Promise.all([
      import('../pages/CategoriesPage'),
      import('../pages/FavoritesPage'),
      import('../pages/WeeklyPage'),
      import('../pages/ShoppingPage'),
      import('../pages/ProfilePage'),
      import('../pages/SubscribePage'),
      import('../pages/CategoryRecipesPage'), // Prefetch für Category-Seite
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

  // Track visited categories
  React.useEffect(() => {
    const match = location.pathname.match(/^\/category\/(.+)$/);
    if (match && match[1]) {
      const category = decodeURIComponent(match[1]);
      setVisitedCategories(prev => {
        if (!prev.has(category)) {
          const newSet = new Set(prev);
          newSet.add(category);
          return newSet;
        }
        return prev;
      });
    }
  }, [location.pathname]);

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

  // Check if current route is a category route
  const categoryMatch = currentPath.match(/^\/category\/(.+)$/);
  const currentCategory = categoryMatch?.[1] ? decodeURIComponent(categoryMatch[1]) : null;
  const isCategoryRoute = !!currentCategory;

  return (
    <ErrorBoundary>
      <div className="antialiased h-[100dvh] w-full flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
        <OfflineBanner />

        {/* Page Content Area - Expands to fill available space */}
        <div className="flex-1 relative w-full overflow-hidden">
          <Suspense fallback={null}>
            {/* TAB-ROUTEN: Permanent im DOM halten */}
            <div style={{ display: isTabRoute ? 'contents' : 'none' }}>
              {tabRoutes.map((tabPath) => (
                <div
                  key={tabPath}
                  ref={(el) => { tabRefs.current[tabPath] = el; }}
                  style={{
                    display: currentPath === tabPath ? 'block' : 'none',
                  }}
                  className="absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden touch-pan-y page-enter"
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

            {/* CATEGORY-ROUTEN: Permanent im DOM halten (cached) */}
            <div style={{ display: isCategoryRoute ? 'contents' : 'none' }}>
              {Array.from(visitedCategories).map((category) => {
                const categoryPath = `/category/${encodeURIComponent(category)}`;
                const isActive = currentCategory === category;
                
                return (
                  <div
                    key={categoryPath}
                    style={{
                      display: isActive ? 'block' : 'none',
                    }}
                    className="absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden touch-pan-y page-enter"
                  >
                    <CategoryRecipesWrapper category={category} />
                  </div>
                );
              })}
            </div>

            {/* OUTLET-ROUTEN: Transient (werden neu gemountet) */}
            {!isTabRoute && !isCategoryRoute && (
              <div key={currentPath} className="absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden touch-pan-y page-enter">
                <Outlet />
              </div>
            )}
          </Suspense>
        </div>

        {/* Navigation - Fixed overlay on bottom */}
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
