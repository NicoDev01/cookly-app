import React, { Activity, Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import AppNav from './AppNav';
import { OfflineBanner } from './OfflineBanner';
import { ErrorBoundary } from './ErrorBoundary';
import { useModal } from '../contexts/ModalContext';
import { prefetchAddRecipeModal } from '../prefetch';
import { usePreventPullDown } from '../hooks/usePreventPullDown';
import { ModalLoader, PageLoader } from './PageLoader';
// Direkt geladen: Der Host muss beim Start eines Foto-Scans sofort bereitstehen (kein sichtbarer Inhalt bis dahin).
import PhotoScanHost from './addRecipe/PhotoScanHost';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack';
import { backTargetFor, type BackNavState } from '../services/backNavigation';

// Lazy load pages
const CategoriesPage = React.lazy(() => import('../pages/CategoriesPage'));
const FavoritesPage = React.lazy(() => import('../pages/FavoritesPage'));
const WeeklyPage = React.lazy(() => import('../pages/WeeklyPage'));
const ShoppingPage = React.lazy(() => import('../pages/ShoppingPage'));
const ProfilePage = React.lazy(() => import('../pages/ProfilePage'));
const SubscribePage = React.lazy(() => import('../pages/SubscribePage'));
const CategoryRecipesPage = React.lazy(() => import('../pages/CategoryRecipesPage'));

const AddRecipeSheet = React.lazy(() => import('./addRecipe/AddRecipeSheet'));

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

/** Scrollfläche eines Tabs; steht am oberen Rand fest wie eine native App (kein Herunterziehen). */
const ScrollArea: React.FC<{ className?: string; tabPath?: string; onNode?: (node: HTMLDivElement | null) => void; children: React.ReactNode }> = ({ className = '', tabPath, onNode, children }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  usePreventPullDown(ref);
  const setRef = React.useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    onNode?.(node);
  }, [onNode]);
  return (
    <div
      ref={setRef}
      data-tab-scroll={tabPath}
      className={`absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden overscroll-y-none touch-pan-y ${className}`}
    >
      {children}
    </div>
  );
};

// Wrapper component to provide params to cached CategoryRecipesPage
const CategoryRecipesWrapper: React.FC<{ category: string }> = ({ category }) => {
  return <CategoryRecipesPage key={category} category={category} />;
};

export const TabsLayout: React.FC = () => {
  const { isAddModalOpen, closeAddModal, openAddModal, isAnyModalOpen } = useModal();
  const location = useLocation();
  const currentPath = location.pathname;
  // Übergänge, die schon wie die Zielseite aussehen (Import → Rezept), ohne Einblenden.
  const seamless = (location.state as { seamless?: boolean } | null)?.seamless === true;
  const currentTab = TAB_ROUTES.find((route) => route === currentPath);
  const categoryMatch = currentPath.match(/^\/category\/(.+)$/);
  const currentCategory = categoryMatch?.[1] ? decodeURIComponent(categoryMatch[1]) : null;
  const [visitedTabs, setVisitedTabs] = useState<TabRoute[]>(() => currentTab ? [currentTab] : []);
  const [retainedCategories, setRetainedCategories] = useState<string[]>(() => currentCategory ? [currentCategory] : []);

  const handleAddRecipe = () => {
    void prefetchAddRecipeModal();
    openAddModal();
  };

  // Die Seite selbst scrollt nie, nur die Tab-Container darin. Sonst lässt sich die App wie eine Website
  // verschieben (z. B. nach dem Antippen eines Eingabefelds) und die Navbar rutscht mit. Siehe index.css.
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add('app-shell');
    // iOS schiebt beim Fokussieren eines Felds sonst die ganze WebView hoch (zusätzlich zu .kb-shell/.kb-pad):
    // Felder rutschen aus dem Bild, unten scheint Weiß durch. Innere Scrollbereiche scrollen weiter normal.
    const ios = Capacitor.getPlatform() === 'ios';
    if (ios) void Keyboard.setScroll({ isDisabled: true }).catch(() => undefined);
    return () => {
      root.classList.remove('app-shell');
      if (ios) void Keyboard.setScroll({ isDisabled: false }).catch(() => undefined);
    };
  }, []);

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

  // Zurück-Wischgeste auf der Rezeptseite (nur iOS: Android hat eine eigene System-Geste vom Rand).
  // Während des Wischens wird die Herkunftsseite darunter sichtbar, sofern sie schon gemountet ist.
  const handleBack = useBackNavigation();
  const [peeking, setPeeking] = useState(false);
  const pageRef = React.useRef<HTMLDivElement>(null);
  const underRef = React.useRef<HTMLDivElement>(null);
  const setPage = React.useCallback((node: HTMLDivElement | null) => { pageRef.current = node; }, []);
  const setUnder = React.useCallback((node: HTMLDivElement | null) => { underRef.current = node; }, []);
  const backTarget = backTargetFor(currentPath, location.state as BackNavState);
  const backTab = TAB_ROUTES.find((route) => route === backTarget);
  const backCategoryMatch = backTarget.match(/^\/category\/(.+)$/);
  const backCategory = backCategoryMatch ? decodeURIComponent(backCategoryMatch[1]) : null;
  const swipeBackEnabled = currentPath.startsWith('/recipe/') && Capacitor.getPlatform() !== 'android';
  useEdgeSwipeBack(pageRef, underRef, { enabled: swipeBackEnabled, pageKey: currentPath, onPeek: setPeeking, onBack: handleBack });
  const peekTab = swipeBackEnabled && peeking ? backTab : undefined;
  const peekCategory = swipeBackEnabled && peeking ? backCategory : null;

  return (
    <ErrorBoundary>
      <div className="antialiased kb-shell fixed inset-0 flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
        <OfflineBanner />

        {/* Page Content Area - Expands to fill available space */}
        <div className="flex-1 relative w-full overflow-hidden">
          <Suspense fallback={<PageLoader />}>
            {mountedTabs.map((tabPath) => (
              <Activity key={tabPath} mode={currentTab === tabPath || peekTab === tabPath ? 'visible' : 'hidden'}>
                {/* Ohne Einblenden: display:none startet CSS-Animationen bei jedem Tab-Wechsel neu, das wirkte träge. */}
                <ScrollArea tabPath={tabPath} onNode={peekTab === tabPath ? setUnder : undefined}>
                  {renderTab(tabPath)}
                </ScrollArea>
              </Activity>
            ))}

            {mountedCategories.map((category) => {
                const categoryPath = `/category/${encodeURIComponent(category)}`;
                const isActive = currentCategory === category;
                
                return (
                  <Activity key={categoryPath} mode={isActive || peekCategory === category ? 'visible' : 'hidden'}>
                    <ScrollArea onNode={peekCategory === category ? setUnder : undefined}>
                      <CategoryRecipesWrapper category={category} />
                    </ScrollArea>
                  </Activity>
                );
            })}

            {/* OUTLET-ROUTEN: Transient (werden neu gemountet) */}
            {!isTabRoute && !isCategoryRoute && (
              <ScrollArea
                key={currentPath}
                onNode={setPage}
                className={`${seamless ? '' : 'page-enter'} ${peeking ? 'z-10 bg-background-light dark:bg-background-dark' : ''}`}
              >
                <Outlet />
              </ScrollArea>
            )}
          </Suspense>
        </div>

        {/* Navigation - Fixed overlay on bottom */}
        {!isAnyModalOpen && <AppNav onAddRecipe={handleAddRecipe} />}

        {/* Foto-Scans laufen hier weiter, auch wenn das Sheet zu ist oder die Seite wechselt. */}
        <PhotoScanHost />

        {/* Add Recipe Modal */}
        {isAddModalOpen && (
          <Suspense fallback={<ModalLoader label="Lädt..." />}>
            <AddRecipeSheet onClose={closeAddModal} />
          </Suspense>
        )}
      </div>
    </ErrorBoundary>
  );
};

TabsLayout.displayName = 'TabsLayout';

export default TabsLayout;
