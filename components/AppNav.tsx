import React, { useLayoutEffect, useRef, useState } from 'react';
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

/** Maße der Auswahl-Pille (w-14 h-8) und ihr Abstand zur Oberkante des Tabs (py-2). */
const PILL_WIDTH = 56;
const PILL_TOP = 8;
/** Die führende Kante läuft vor, die hintere zieht nach: so „fließt“ die Pille zum neuen Tab. */
const PILL_LEAD = '170ms cubic-bezier(0.2, 0.9, 0.3, 1.1)';
const PILL_TRAIL = '250ms cubic-bezier(0.4, 0, 0.2, 1)';

type PillBox = { left: number; right: number; top: number; movingRight: boolean; animate: boolean };

const AppNav: React.FC<{
  onAddRecipe: () => void;
}> = ({ onAddRecipe }) => {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser);
  const { impact } = useHaptic();

  const isActive = (path: string) => location.pathname === path;
  const visible = shouldShowNav(location.pathname);

  const rowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<PillBox | null>(null);
  // Getippter Tab: Die Pille läuft sofort los, auch wenn die Seite noch lädt.
  const [tapped, setTapped] = useState<{ index: number; from: string } | null>(null);

  const intentHandlers = (prefetch: () => Promise<unknown>) => ({
    onPointerEnter: () => { void prefetch(); },
    onFocus: () => { void prefetch(); },
    onTouchStart: () => { void prefetch(); },
  });

  const handleNavTap = (index: number, path: string) => {
    // Wie in iOS-Tab-Leisten: Den aktiven Tab nochmal antippen scrollt nach oben (Container in TabsLayout).
    if (path === location.pathname) {
      document.querySelector(`[data-tab-scroll="${path}"]`)?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setTapped({ index, from: location.pathname });
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

  const routeIndex = navItems.findIndex(({ path }) => isActive(path));
  // Sobald die Route gewechselt hat, zählt nur noch sie. Sonst markierte ein Link zurück zur Ausgangsseite
  // (z. B. „Rezepte ansehen“ in leeren Favoriten nach Tipp von Kategorien) weiter den alten Tab.
  if (tapped && tapped.from !== location.pathname) setTapped(null);
  const activeIndex = tapped && tapped.from === location.pathname ? tapped.index : routeIndex;

  // Pille unter den aktiven Tab legen. offset* statt getBoundingClientRect, weil touch-scale
  // den gedrückten Tab skaliert. Erste Position und Größenänderungen ohne Animation.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!visible || !row) return;
    const place = (animate: boolean) => {
      const tab = tabRefs.current[activeIndex];
      if (!tab) { setPill(null); return; }
      const left = tab.offsetLeft + (tab.offsetWidth - PILL_WIDTH) / 2;
      const right = row.clientWidth - left - PILL_WIDTH;
      setPill((prev) => ({
        left,
        right,
        top: tab.offsetTop + PILL_TOP,
        movingRight: prev ? left >= prev.left : true,
        animate: animate && prev !== null,
      }));
    };
    place(true);
    // Der Observer meldet sich sofort einmal; nur echte Breitenänderungen neu setzen,
    // sonst würde „ohne Animation“ die gerade gestartete Bewegung abbrechen.
    let width = row.clientWidth;
    const observer = new ResizeObserver(() => {
      if (row.clientWidth === width) return;
      width = row.clientWidth;
      place(false);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [activeIndex, visible]);

  // Don't render if not on a nav route
  if (!visible) {
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
      className="app-nav fixed bottom-0 left-0 right-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-lg border-t border-t-black/5 dark:border-t-white/5"
      style={{
        // Bis knapp über den Home-Indikator (iOS-Tab-Leisten machen das genauso); ohne Inset 8px.
        paddingBottom: 'max(calc(var(--safe-area-inset-bottom, 0px) - 14px), 8px)',
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
      <div ref={rowRef} className="relative flex justify-around items-center px-2 pt-1">
        {pill && (
          <div
            aria-hidden
            className="pointer-events-none absolute h-8 rounded-full bg-primary shadow-neo-light-convex dark:shadow-neo-dark-convex motion-reduce:!transition-none"
            style={{
              left: pill.left,
              right: pill.right,
              top: pill.top,
              transition: pill.animate
                ? pill.movingRight
                  ? `right ${PILL_LEAD}, left ${PILL_TRAIL}`
                  : `left ${PILL_LEAD}, right ${PILL_TRAIL}`
                : 'none',
            }}
          />
        )}
        {navItems.map(({ path, icon, label, prefetch }, index) => (
          <Link
            key={path}
            ref={(el) => { tabRefs.current[index] = el; }}
            to={path}
            {...intentHandlers(prefetch)}
            onClick={() => handleNavTap(index, path)}
            className={`touch-scale flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[56px] rounded-xl transition-colors duration-200 ${
              index === activeIndex
                ? 'text-text-primary-light dark:text-text-primary-dark'
                : 'text-text-secondary-light dark:text-text-secondary-dark'
            }`}
          >
            <div className="relative flex h-8 w-14 items-center justify-center">
              {/* Weiß erst, wenn die Pille ankommt; sonst stünde ein weißes Icon kurz auf hellem Grund. */}
              <span
                className={`material-symbols-outlined transition-all duration-150 ${index === activeIndex ? 'filled text-white delay-75 scale-105' : ''}`}
                style={{ fontSize: '28px' }}
              >
                {icon}
              </span>
            </div>
            <p className={`text-[12px] font-bold leading-tight transition-colors duration-200 ${index === activeIndex ? 'text-primary' : ''}`}>
              {label}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AppNav;
