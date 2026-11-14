/**
 * Lese-Cache für Kaltstart und Offline: die zuletzt vom Server gelieferten Ergebnisse ausgewählter Queries
 * (Nutzer, Kategorien, Rezeptlisten, geöffnete Rezepte, Einkaufsliste, Wochenplan) liegen im localStorage.
 *
 * Regeln, damit er sich nie mit dem Server widerspricht:
 * - Nur lesen: Schreiben läuft weiter ausschließlich über Convex. Es gibt nichts zu synchronisieren.
 * - Der Server gewinnt: Sobald eine Query antwortet, wird ihr Ergebnis angezeigt und der Cache überschrieben.
 * - Pro Nutzer getrennt; Abmelden, Kontowechsel und jedes App-Update (andere Datenform) leeren ihn.
 * - Speicherfehler (voll, privat, gesperrt) schalten ihn still ab, die App läuft dann wie ohne Cache.
 */
import { APP_BUILD, APP_VERSION } from '../utils/appInfo.ts';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const ROOT = 'cookly.offline.';
const VERSION = `${APP_VERSION}+${APP_BUILD}`;
const USER_KEY = `${ROOT}user`;
const INDEX_KEY = `${ROOT}index`;

/** Höchstzahl Einträge je Präfix; der am längsten nicht geschriebene fliegt zuerst. */
const LIMITS: Array<[string, number]> = [
  ['recipe-', 40],
  ['category-', 15],
  ['week-', 4],
];

type CachedUser = { _id: string; onboardingCompleted?: boolean };
type Envelope = { v: string; user: string; data: unknown };
type Index = Record<string, number>;

let storage: Storage | null = null;
try {
  storage = typeof localStorage === 'undefined' ? null : localStorage;
} catch {
  storage = null;
}

/** Nur für Tests: anderen Speicher einsetzen. */
export function setOfflineStorage(next: Storage | null) {
  storage = next;
}

const parse = <T>(raw: string | null): T | undefined => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

const readIndex = (): Index => parse<Index>(storage?.getItem(INDEX_KEY) ?? null) ?? {};
const writeIndex = (index: Index) => storage?.setItem(INDEX_KEY, JSON.stringify(index));
const entryKey = (key: string) => `${ROOT}q.${key}`;

/** Zuletzt angemeldeter Nutzer, sofern er zu dieser App-Version gespeichert wurde. */
export function getCachedUser<T extends CachedUser = CachedUser>(): T | undefined {
  try {
    const envelope = parse<Envelope>(storage?.getItem(USER_KEY) ?? null);
    if (!envelope || envelope.v !== VERSION) return undefined;
    return envelope.data as T;
  } catch {
    return undefined;
  }
}

/** Server-Antwort für den Nutzer merken. Ein anderer Nutzer als bisher räumt den Cache vorher leer. */
export function rememberUser(user: CachedUser | null | undefined) {
  if (!user?._id) return;
  try {
    const previous = getCachedUser();
    if (previous && previous._id !== user._id) clearOfflineCache();
    storage?.setItem(USER_KEY, JSON.stringify({ v: VERSION, user: user._id, data: user } satisfies Envelope));
  } catch {
    // Speicher voll oder gesperrt: ohne Cache weiter.
  }
}

export function readOfflineCache<T>(key: string): T | undefined {
  const user = getCachedUser();
  if (!user) return undefined;
  try {
    const envelope = parse<Envelope>(storage?.getItem(entryKey(key)) ?? null);
    if (!envelope || envelope.v !== VERSION || envelope.user !== user._id) return undefined;
    return envelope.data as T;
  } catch {
    return undefined;
  }
}

const evict = (index: Index, key: string) => {
  storage?.removeItem(entryKey(key));
  delete index[key];
};

/** Ältesten Eintrag löschen (für "Speicher voll"). Liefert false, wenn nichts mehr da ist. */
const evictOldest = (index: Index) => {
  const oldest = Object.entries(index).sort((a, b) => a[1] - b[1])[0];
  if (!oldest) return false;
  evict(index, oldest[0]);
  return true;
};

export function writeOfflineCache(key: string, data: unknown) {
  const user = getCachedUser();
  if (!user || !storage) return;
  try {
    const index = readIndex();
    if (data === undefined || data === null) {
      // Gelöscht oder kein Zugriff mehr: nichts Veraltetes aufheben.
      evict(index, key);
      writeIndex(index);
      return;
    }
    const value = JSON.stringify({ v: VERSION, user: user._id, data } satisfies Envelope);
    for (let attempt = 0; ; attempt++) {
      try {
        storage.setItem(entryKey(key), value);
        break;
      } catch (error) {
        if (attempt > 50 || !evictOldest(index)) throw error;
      }
    }
    index[key] = Date.now();
    for (const [prefix, limit] of LIMITS) {
      if (!key.startsWith(prefix)) continue;
      const group = Object.entries(index).filter(([name]) => name.startsWith(prefix)).sort((a, b) => b[1] - a[1]);
      for (const [name] of group.slice(limit)) evict(index, name);
    }
    writeIndex(index);
  } catch {
    // Eintrag ist zu groß oder Speicher gesperrt: diesen einen nicht cachen.
  }
}

/** Alles löschen: Abmelden, Konto löschen, Kontowechsel. */
export function clearOfflineCache() {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(ROOT)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // ignorieren
  }
}

/**
 * Liegt ein Login-Token von Convex Auth für dieses Deployment im Speicher? Dann war der Nutzer beim letzten
 * Start angemeldet und die App darf aus dem Cache starten, während Convex den Token noch prüft (oder offline ist).
 * Schlüssel wie in @convex-dev/auth (useNamespacedStorage): `__convexAuthJWT_<URL ohne Sonderzeichen>`.
 */
export function hasStoredAuthToken(convexUrl = import.meta.env?.VITE_CONVEX_URL as string | undefined) {
  if (!storage || !convexUrl) return false;
  try {
    return !!storage.getItem(`__convexAuthJWT_${convexUrl.replace(/[^a-zA-Z0-9]/g, '')}`);
  } catch {
    return false;
  }
}
