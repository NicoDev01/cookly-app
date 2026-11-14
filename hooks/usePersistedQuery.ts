import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { readOfflineCache, writeOfflineCache } from '../services/offlineCache';
import type { OutboxState } from '../services/offlineOutbox';
import { useOutbox } from './useOfflineWrites';

/**
 * Wie `useQuery`, hält aber das letzte Ergebnis beim Tab-Wechsel (Tabs in <Activity>) und hat einen Lese-Cache auf dem Gerät (services/offlineCache): Beim Kaltstart
 * und ohne Netz steht sofort das letzte Server-Ergebnis da. Sobald der Server antwortet, gilt nur noch das.
 * `cacheKey` muss die Argumente eindeutig abbilden; `null` schaltet den Gerätespeicher ab.
 * `overlay` legt offline gemerkte Änderungen (services/offlineOutbox) über das Ergebnis; nur die Anzeige, nie den Cache.
 * Muss eine stabile Funktion sein (Modulebene).
 */
export function usePersistedQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: Query['_args'] | 'skip',
  cacheKey: string | null,
  overlay?: (value: NonNullable<Query['_returnType']>, outbox: OutboxState) => Query['_returnType'],
): Query['_returnType'] | undefined {
  const live = useQuery(query, args);
  const key = args === 'skip' ? null : cacheKey;
  const stored = useMemo(() => (key ? readOfflineCache<Query['_returnType']>(key) : undefined), [key]);
  const outbox = useOutbox();

  // Letztes Ergebnis halten, solange neue Argumente laden (Tabs in <Activity>, Wechsel der Kategorie).
  const last = useRef<{ key: string | null; value: Query['_returnType'] | undefined }>({ key, value: undefined });
  if (live !== undefined) last.current = { key, value: live };

  useEffect(() => {
    if (key && live !== undefined) writeOfflineCache(key, live);
  }, [key, live]);

  // Nie das Ergebnis anderer Argumente zeigen (Kategorie A unter Kategorie B).
  const value = live !== undefined ? live : last.current.key === key && last.current.value !== undefined ? last.current.value : stored;
  return useMemo(
    () => (overlay && value !== undefined && value !== null ? overlay(value, outbox) : value),
    [overlay, value, outbox],
  );
}
