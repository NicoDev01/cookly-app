import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useConvexAuth } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { convexClient } from '../convexClient';
import { useNotification } from '../contexts/NotificationContext';
import { enqueue, flushOutbox, getOutbox, subscribeOutbox, supersede, type OutboxOp, type OutboxState } from '../services/offlineOutbox';

/** Offline: Socket zu Convex getrennt oder das Gerät meldet kein Netz. */
export const isOffline = () =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) || !convexClient.connectionState().isWebSocketConnected;

export const OFFLINE_MESSAGE = 'Offline – geht wieder, sobald du online bist';

const sendOp = (op: OutboxOp) => {
  if (op.kind === 'shopping.remove') return convexClient.mutation(api.shopping.removeShoppingItems, { ids: op.ids as Id<'shoppingItems'>[] });
  if (op.kind === 'shopping.setChecked') {
    return convexClient.mutation(api.shopping.setShoppingItemsChecked, { ids: op.ids as Id<'shoppingItems'>[], checked: op.checked });
  }
  return convexClient.mutation(api.recipes.setFavorite, { id: op.id as Id<'recipes'>, isFavorite: op.isFavorite });
};

/** Offene Ops des Nutzers; rendert neu, sobald sich die Outbox ändert. */
export const useOutbox = (): OutboxState => useSyncExternalStore(subscribeOutbox, getOutbox, getOutbox);

/**
 * Nachreichen: sobald der Socket verbunden, der Nutzer angemeldet und vom Server bestätigt ist
 * (`serverUserId` = Antwort von getCurrentUser), sonst nie (falsches Konto, noch kein Login).
 */
export function useOutboxSync(serverUserId: string | undefined) {
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated || !serverUserId) return;
    const flush = () => {
      if (!isOffline()) void flushOutbox(sendOp, isOffline);
    };
    flush();
    let wasConnected = convexClient.connectionState().isWebSocketConnected;
    const unsubscribe = convexClient.subscribeToConnectionState((state) => {
      if (state.isWebSocketConnected && !wasConnected) flush();
      wasConnected = state.isWebSocketConnected;
    });
    window.addEventListener('online', flush);
    return () => {
      unsubscribe();
      window.removeEventListener('online', flush);
    };
  }, [isAuthenticated, serverUserId]);
}

type OpArgs<K extends OutboxOp['kind']> = Omit<Extract<OutboxOp, { kind: K }>, 'kind'>;

/**
 * Schreibaufruf mit fester Ja/Nein-Wirkung: online die Mutation (mit ihrem Optimistic Update), offline in die
 * Outbox. Zusätzliche Argumente (z. B. `favoritedAt`) gehen nur online mit.
 */
export function useOfflineAwareMutation<K extends OutboxOp['kind'], A extends OpArgs<K>>(
  kind: K,
  mutate: (args: A) => Promise<unknown>,
): (args: A) => Promise<void> {
  return useCallback(
    async (args: A) => {
      const op = { ...args, kind } as unknown as OutboxOp;
      if (isOffline() && enqueue(op)) return;
      supersede(op);
      await mutate(args);
    },
    [kind, mutate],
  );
}

/** Nicht idempotente Aktionen offline sperren: kurzer Hinweis statt stillem Nachsenden. Liefert, ob ausgeführt. */
export function useOnlineOnly() {
  const { showToast } = useNotification();
  return useCallback(
    (action: () => void) => {
      if (isOffline()) {
        showToast(OFFLINE_MESSAGE, 'info');
        return false;
      }
      action();
      return true;
    },
    [showToast],
  );
}
