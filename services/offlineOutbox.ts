/**
 * Offline-Schreiben „merken und nachreichen“: Abhaken, Entfernen und Favorisieren wirken ohne Netz sofort und
 * gehen später an den Server. Nur Operationen mit fester Ja/Nein-Wirkung (keine Toggles), damit doppeltes oder
 * spätes Senden nie etwas anderes bewirkt als einmaliges.
 *
 * - Liegt im localStorage unter `cookly.offline.`, also leert `clearOfflineCache` (Abmelden, Kontowechsel) sie mit.
 * - Pro Nutzer: gilt nur für `getCachedUser()`; ein fremder Stand wird nie gelesen oder gesendet.
 * - Je ID zusammengefasst: der letzte Wert gewinnt, Entfernen schlägt Abhaken.
 * - Nachreichen: Erfolg oder Serverfehler (z. B. Rezept gelöscht) entfernen die Op, der Server gewinnt.
 *   Nur wenn beim Fehler das Netz fehlt, bleibt sie liegen.
 */
import { getCachedUser } from './offlineCache.ts';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type OutboxOp =
  | { kind: 'shopping.setChecked'; ids: string[]; checked: boolean }
  | { kind: 'shopping.remove'; ids: string[] }
  | { kind: 'recipe.setFavorite'; id: string; isFavorite: boolean };

type ShoppingPending = { checked?: boolean; removed?: true };
export type OutboxState = {
  shopping: Record<string, ShoppingPending>;
  favorites: Record<string, boolean>;
};
type Stored = OutboxState & { user: string };

const KEY = 'cookly.offline.outbox';
const EMPTY: OutboxState = Object.freeze({ shopping: Object.freeze({}), favorites: Object.freeze({}) }) as OutboxState;

let storage: Storage | null = null;
try {
  storage = typeof localStorage === 'undefined' ? null : localStorage;
} catch {
  storage = null;
}

/** Nur für Tests: anderen Speicher einsetzen. */
export function setOutboxStorage(next: Storage | null) {
  storage = next;
  snapshot = null;
}

const listeners = new Set<() => void>();
let snapshot: { raw: string | null; user: string | undefined; state: OutboxState } | null = null;

/** Offene Ops des aktuellen Nutzers. Stabil, solange sich nichts ändert (für useSyncExternalStore). */
export function getOutbox(): OutboxState {
  const user = getCachedUser()?._id;
  let raw: string | null = null;
  try {
    raw = storage?.getItem(KEY) ?? null;
  } catch {
    raw = null;
  }
  if (snapshot && snapshot.raw === raw && snapshot.user === user) return snapshot.state;
  let state = EMPTY;
  if (raw && user) {
    try {
      const stored = JSON.parse(raw) as Stored;
      if (stored.user === user) state = { shopping: stored.shopping ?? {}, favorites: stored.favorites ?? {} };
    } catch {
      state = EMPTY;
    }
  }
  snapshot = { raw, user, state };
  return state;
}

export function subscribeOutbox(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const notify = () => {
  for (const listener of listeners) listener();
};

const isEmpty = (state: OutboxState) => !Object.keys(state.shopping).length && !Object.keys(state.favorites).length;

const write = (update: (state: OutboxState) => OutboxState) => {
  const user = getCachedUser()?._id;
  if (!user || !storage) return false;
  const next = update(getOutbox());
  try {
    if (isEmpty(next)) storage.removeItem(KEY);
    else storage.setItem(KEY, JSON.stringify({ user, ...next } satisfies Stored));
  } catch {
    return false;
  }
  notify();
  return true;
};

/** Op merken. Liefert false, wenn es keinen Nutzer oder Speicher gibt (dann wirkt sie auch nicht). */
export function enqueue(op: OutboxOp) {
  return write((state) => {
    const shopping = { ...state.shopping };
    const favorites = { ...state.favorites };
    if (op.kind === 'shopping.remove') {
      for (const id of op.ids) shopping[id] = { removed: true };
    } else if (op.kind === 'shopping.setChecked') {
      for (const id of op.ids) if (!shopping[id]?.removed) shopping[id] = { checked: op.checked };
    } else {
      favorites[op.id] = op.isFavorite;
    }
    return { shopping, favorites };
  });
}

/**
 * Online direkt gesendete Op ersetzt offene Ops derselben IDs, damit ein späteres Nachreichen sie nicht mit einem
 * älteren Wert überschreibt. Entfernen bleibt stehen, wenn nur abgehakt wird (das Item ist dann ohnehin weg).
 */
export function supersede(op: OutboxOp) {
  const state = getOutbox();
  const ids = op.kind === 'recipe.setFavorite' ? [op.id] : op.ids;
  const touched = op.kind === 'recipe.setFavorite'
    ? ids.some((id) => id in state.favorites)
    : ids.some((id) => id in state.shopping && (op.kind === 'shopping.remove' || !state.shopping[id].removed));
  if (!touched) return;
  write((current) => {
    const shopping = { ...current.shopping };
    const favorites = { ...current.favorites };
    for (const id of ids) {
      if (op.kind === 'recipe.setFavorite') delete favorites[id];
      else if (op.kind === 'shopping.remove' || !shopping[id]?.removed) delete shopping[id];
    }
    return { shopping, favorites };
  });
}

/** Offene Ops als möglichst wenige Mutationen: je ein Aufruf für Entfernen, Abhaken, Öffnen; je Rezept einer. */
export function pendingOps(state: OutboxState = getOutbox()): OutboxOp[] {
  const removed: string[] = [];
  const checked: string[] = [];
  const unchecked: string[] = [];
  for (const [id, pending] of Object.entries(state.shopping)) {
    if (pending.removed) removed.push(id);
    else if (pending.checked === true) checked.push(id);
    else if (pending.checked === false) unchecked.push(id);
  }
  const ops: OutboxOp[] = [];
  if (removed.length) ops.push({ kind: 'shopping.remove', ids: removed });
  if (checked.length) ops.push({ kind: 'shopping.setChecked', ids: checked, checked: true });
  if (unchecked.length) ops.push({ kind: 'shopping.setChecked', ids: unchecked, checked: false });
  for (const [id, isFavorite] of Object.entries(state.favorites)) ops.push({ kind: 'recipe.setFavorite', id, isFavorite });
  return ops;
}

/** Gesendete Op austragen, sofern sich der Wert inzwischen nicht geändert hat (offline erneut getippt). */
const settle = (op: OutboxOp) =>
  write((state) => {
    const shopping = { ...state.shopping };
    const favorites = { ...state.favorites };
    if (op.kind === 'recipe.setFavorite') {
      if (favorites[op.id] === op.isFavorite) delete favorites[op.id];
    } else {
      for (const id of op.ids) {
        const pending = shopping[id];
        if (!pending) continue;
        if (op.kind === 'shopping.remove' ? pending.removed : !pending.removed && pending.checked === op.checked) delete shopping[id];
      }
    }
    return { shopping, favorites };
  });

let flushing: Promise<void> | null = null;

/**
 * Offene Ops nacheinander senden. `isOffline` entscheidet bei einem Fehler: offline bleibt die Op liegen
 * (und das Nachreichen endet), sonst ist es ein Serverfehler und die Op fliegt raus.
 */
export function flushOutbox(send: (op: OutboxOp) => Promise<unknown>, isOffline: () => boolean): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      for (let round = 0; round < 5; round++) {
        const ops = pendingOps();
        if (!ops.length) return;
        for (const op of ops) {
          try {
            await send(op);
          } catch (error) {
            if (isOffline()) return;
            console.warn('[Outbox] Server lehnt ab, verworfen:', op.kind, error);
          }
          settle(op);
        }
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

// ---- Overlay: offene Ops über angezeigte Daten legen (Cache oder live) ----

type ShoppingLike = { _id: string; checked: boolean };
type FavoriteLike = { _id: string; isFavorite?: boolean };

export function overlayShoppingList<T extends ShoppingLike>(list: T[], state: OutboxState = getOutbox()): T[] {
  if (!Object.keys(state.shopping).length) return list;
  return list.flatMap((item) => {
    const pending = state.shopping[item._id];
    if (!pending) return [item];
    if (pending.removed) return [];
    return pending.checked === undefined || pending.checked === item.checked ? [item] : [{ ...item, checked: pending.checked }];
  });
}

export function overlayFavorite<T extends FavoriteLike>(recipe: T, state: OutboxState = getOutbox()): T {
  const pending = state.favorites[recipe._id];
  return pending === undefined || pending === recipe.isFavorite ? recipe : { ...recipe, isFavorite: pending };
}

/** Favoritenliste: offline Entfernte ausblenden. Offline neu favorisierte erscheinen erst nach dem Nachreichen. */
export function overlayFavoritesList<T extends FavoriteLike>(list: T[], state: OutboxState = getOutbox()): T[] {
  if (!Object.keys(state.favorites).length) return list;
  return list.filter((recipe) => state.favorites[recipe._id] !== false);
}
