import React, { Activity, Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AppNav from './AppNav';
import { OfflineBanner } from './OfflineBanner';
import { ErrorBoundary } from './ErrorBoundary';
import { useModal } from '../contexts/ModalContext';
import { prefetchAddRecipeModal } from '../prefetch';
import { ModalLoader, PageLoader } from './PageLoader';

// Lazy load pages
const CategoriesPage = React.lazy(() => import('../pages/CategoriesPage'));
const FavoritesPage = React.lazy(() => import('../pages/FavoritesPage'));
const WeeklyPage = React.lazy(() => import('../pages/WeeklyPage'));
const ShoppingPage = React.lazy(() => import('../pages/ShoppingPage'));
const ProfilePage = React.lazy(() => import('../pages/ProfilePage'));
const SubscribePage = React.lazy(() => import('../pages/SubscribePage'));
const CategoryRecipesPage = React.lazy(() => import('../pages/CategoryRecipesPage'));

const AddRecipeModal = React.lazy(() => import('./AddRecipeModal'));

const TAB_ROUTES = [
  '/tabs/categories',
  '/tabs/favorites',
  '/tabs/weekly',
  '/tabs/shopping',
  '/tabs/profile',
  '/tabs/subscribe',
] as const;

type TabRoute = typeof TAB_ROUTES[number];

const renderTab = (route: TabRoute) => {
  if (route === '/tabs/categories') return <CategoriesPage />;
  if (route === '/tabs/favorites') return <FavoritesPage />;
  if (route === '/tabs/weekly') return <WeeklyPage />;
  if (route === '/tabs/shopping') return <ShoppingPage />;
  if (route === '/tabs/profile') return <ProfilePage />;
  return <SubscribePage />;
};

// Wrapper component to provide params to cached CategoryRecipesPage
const CategoryRecipesWrapper: React.FC<{ category: string }> = ({ category }) => {
  return <CategoryRecipesPage key={category} category={category} />;
};

export const TabsLayout: React.FC = () => {
  const { isAddModalOpen, closeAddModal, openAddModal, isAnyModalOpen } = useModal();
  const location = useLocation();
  const currentPath = location.pathname;
  const currentTab = TAB_ROUTES.find((route) => route === currentPath);
  const categoryMatch = currentPath.match(/^\/category\/(.+)$/);
  const currentCategory = categoryMatch?.[1] ? decodeURIComponent(categoryMatch[1]) : null;
  const [visitedTabs, setVisitedTabs] = useState<TabRoute[]>(() => currentTab ? [currentTab] : []);
  const [retainedCategories, setRetainedCategories] = useState<string[]>(() => currentCategory ? [currentCategory] : []);

  const handleAddRecipe = () => {
    void prefetchAddRecipeModal();
    openAddModal();
  };

  React.useEffect(() => {
    if (currentTab) {
      setVisitedTabs((routes) => routes.includes(currentTab) ? routes : [...routes, currentTab]);
    }
    if (currentCategory) {
      setRetainedCategories((categories) => [
        ...categories.filter((category) => category !== currentCategory),
        currentCategory,
      ].slice(-3));
    }
  }, [currentCategory, currentTab]);

  const mountedTabs = currentTab && !visitedTabs.includes(currentTab)
    ? [...visitedTabs, currentTab]
    : visitedTabs;
  const mountedCategories = currentCategory && !retainedCategories.includes(currentCategory)
    ? [...retainedCategories, currentCategory].slice(-3)
    : retainedCategories;
  const isTabRoute = Boolean(currentTab);
  const isCategoryRoute = !!currentCategory;

  return (
    <ErrorBoundary>
      <div className="antialiased h-[100dvh] w-full flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
        <OfflineBanner />

        {/* Page Content Area - Expands to fill available space */}
        <div className="flex-1 relative w-full overflow-hidden">
          <Suspense fallback={<PageLoader />}>
            {mountedTabs.map((tabPath) => (
              <Activity key={tabPath} mode={currentTab === tabPath ? 'visible' : 'hidden'}>
                <div
                  className="absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden touch-pan-y page-enter"
                >
                  {renderTab(tabPath)}
                </div>
              </Activity>
            ))}

            {mountedCategories.map((category) => {
                const categoryPath = `/category/${encodeURIComponent(category)}`;
                const isActive = currentCategory === category;
                
                return (
                  <Activity key={categoryPath} mode={isActive ? 'visible' : 'hidden'}>
                    <div className="absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden touch-pan-y page-enter">
                      <CategoryRecipesWrapper category={category} />
                    </div>
                  </Activity>
                );
            })}

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
          <Suspense fallback={<ModalLoader label="Rezeptformular lädt..." />}>
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
