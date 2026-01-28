import React, { createContext, useContext, ReactNode, useRef } from 'react';
import { useQuery } from 'convex/react';

/**
 * Query Cache Context für Performance-Optimierung (QW-2)
 *
 * Speichert Convex Query Results im Memory, um bei Tab-Wechseln
 * sofort gecachte Daten anzeigen zu können (Stale-While-Revalidate Pattern).
 */
type QueryCacheContextValue = {
  getCache: (key: string) => any;
  setCache: (key: string, value: any) => void;
  clearCache: (key?: string) => void;
};

const QueryCacheContext = createContext<QueryCacheContextValue | undefined>(undefined);

/**
 * Provider für Query Cache
 *
 * Speichert Cache in useRef statt useState für bessere Performance
 * (vermeidet unnötige Re-renders)
 */
export const QueryCacheProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const cacheRef = useRef<Record<string, { data: any; timestamp: number }>>({});

  const getCache = (key: string): any | undefined => {
    const entry = cacheRef.current[key];
    if (!entry) return undefined;

    // Cache ist 5 Minuten gültig
    const CACHE_TTL = 5 * 60 * 1000;
    const isExpired = Date.now() - entry.timestamp > CACHE_TTL;

    if (isExpired) {
      delete cacheRef.current[key];
      return undefined;
    }

    return entry.data;
  };

  const setCache = (key: string, value: any) => {
    cacheRef.current[key] = {
      data: value,
      timestamp: Date.now(),
    };
  };

  const clearCache = (key?: string) => {
    if (key) {
      delete cacheRef.current[key];
    } else {
      cacheRef.current = {};
    }
  };

  return (
    <QueryCacheContext.Provider value={{ getCache, setCache, clearCache }}>
      {children}
    </QueryCacheContext.Provider>
  );
};

/**
 * Hook für Zugriff auf Query Cache
 */
export const useQueryCache = () => {
  const context = useContext(QueryCacheContext);
  if (!context) {
    throw new Error('useQueryCache must be used within QueryCacheProvider');
  }
  return context;
};

/**
 * Wrapper-Hook für Convex useQuery mit Caching
 *
 * Gibt sofort gecachte Daten zurück, während frische Daten im Hintergrund geladen werden.
 *
 * @example
 * const categories = useCachedQuery(
 *   api.categories.getCategoriesWithStats,
 *   {},
 *   'categoriesWithStats'
 * );
 */
export function useCachedQuery<T>(
  queryFn: any,
  args: any,
  cacheKey: string
): { data: T | undefined; isLoading: boolean; isRefreshing: boolean } {
  const { getCache, setCache } = useQueryCache();
  const convexResult = useQuery(queryFn, args);

  // Gecachte Daten sofort zurückgeben
  const cachedData = getCache(cacheKey);
  const hasData = convexResult !== undefined && convexResult.data !== undefined;

  // Cache aktualisieren wenn neue Daten da sind
  React.useEffect(() => {
    if (hasData && convexResult?.data) {
      setCache(cacheKey, convexResult.data);
    }
  }, [hasData, convexResult?.data, cacheKey, setCache]);

  return {
    // Gecachte Daten zurückgeben während loading, sonst frische Daten
    data: convexResult?.data ?? cachedData,
    // True wenn weder Cache noch frische Daten da sind
    isLoading: !cachedData && (convexResult?.isLoading ?? false),
    // True wenn wir Cache haben aber auf frische Daten warten
    isRefreshing: !!cachedData && (convexResult?.isLoading ?? false),
  };
}

QueryCacheProvider.displayName = 'QueryCacheProvider';
