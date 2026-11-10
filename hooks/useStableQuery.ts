import { useRef } from 'react';
import { useQuery } from 'convex/react';

/**
 * Wie `useQuery`, behält aber das letzte Ergebnis, solange ein neues lädt (Muster aus dem Convex-Blog
 * „Help, my app is overreacting“). Tabs liegen in `<Activity>`: Beim Ausblenden endet das Abo, beim
 * Zurückwechseln wäre das Ergebnis kurz `undefined` und die Ansicht würde flackern.
 */
export const useStableQuery = ((query, ...args) => {
  const result = useQuery(query, ...args);
  const stored = useRef(result);
  if (result !== undefined) stored.current = result;
  return stored.current;
}) as typeof useQuery;
