import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { readOfflineCache, writeOfflineCache } from '../services/offlineCache';

/**
 * Wie `useQuery`, hält aber das letzte Ergebnis beim Tab-Wechsel (Tabs in <Activity>) und hat einen Lese-Cache auf dem Gerät (services/offlineCache): Beim Kaltstart
 * und ohne Netz steht sofort das letzte Server-Ergebnis da. Sobald der Server antwortet, gilt nur noch das.
 * `cacheKey` muss die Argumente eindeutig abbilden; `null` schaltet den Gerätespeicher ab.
 */
export function usePersistedQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: Query['_args'] | 'skip',
  cacheKey: string | null,
): Query['_returnType'] | undefined {
  const live = useQuery(query, args);
  const key = args === 'skip' ? null : cacheKey;
  const stored = useMemo(() => (key ? readOfflineCache<Query['_returnType']>(key) : undefined), [key]);

  // Letztes Ergebnis halten, solange neue Argumente laden (Tabs in <Activity>, Wechsel der Kategorie).
  const last = useRef<{ key: string | null; value: Query['_returnType'] | undefined }>({ key, value: undefined });
  if (live !== undefined) last.current = { key, value: live };

  useEffect(() => {
    if (key && live !== undefined) writeOfflineCache(key, live);
  }, [key, live]);

  if (live !== undefined) return live;
  // Nie das Ergebnis anderer Argumente zeigen (Kategorie A unter Kategorie B).
  return last.current.key === key && last.current.value !== undefined ? last.current.value : stored;
}
