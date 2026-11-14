import { api } from '../convex/_generated/api';
import { addDays, toDateString, weekStartForOffset } from '../utils/weekPlan';
import { usePersistedQuery } from './usePersistedQuery';

/**
 * Hält die aktuelle Woche im Offline-Cache aktuell, auch wenn der Wochen-Tab nie oder nur im Hintergrund
 * (<Activity>, ohne Effekte) offen war; sonst fehlt der Wochenplan offline oder ist veraltet.
 * Gleiche Argumente und gleicher Schlüssel wie WeeklyPage (`week-${startDate}`) und die Favoriten:
 * Convex teilt sich die eine Subscription, die Daten sind schlanke Vorschauen (CLAUDE.md Regel 1).
 */
export function useCurrentWeekCache(enabled: boolean) {
  const weekStart = weekStartForOffset(0);
  const startDate = toDateString(weekStart);
  usePersistedQuery(
    api.weekly.getWeek,
    enabled ? { startDate, endDate: toDateString(addDays(weekStart, 6)) } : 'skip',
    `week-${startDate}`,
  );
}
