import React, { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { OptimisticLocalStore } from 'convex/browser';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import ShoppingListView, { type ShoppingMode } from '../components/shopping/ShoppingListView';
import { useNotification } from '../contexts/NotificationContext';
import { usePersistedQuery } from '../hooks/usePersistedQuery';
import { useOfflineAwareMutation, useOnlineOnly } from '../hooks/useOfflineWrites';
import { overlayShoppingList } from '../services/offlineOutbox';
import { logger } from '../utils/logger';
import { getUserErrorMessage } from '../utils/userErrors';
import { buildShoppingItemKey, type ShoppingListViewItem } from '../utils/shoppingListView';

const MODE_KEY = 'cookly.shopping.mode';
const readMode = (): ShoppingMode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'recipes' ? 'recipes' : 'sections';
  } catch {
    return 'sections';
  }
};

type ListValue = NonNullable<ReturnType<typeof useQuery<typeof api.shopping.getShoppingList>>>;

const patchList = (store: OptimisticLocalStore, fn: (list: ListValue) => ListValue) => {
  const current = store.getQuery(api.shopping.getShoppingList, {});
  if (current) store.setQuery(api.shopping.getShoppingList, {}, fn(current));
};

const ShoppingPage: React.FC = () => {
  const { showToast } = useNotification();
  const [mode, setMode] = useState<ShoppingMode>(readMode);
  // Beim Tab-Wechsel die letzte Liste zeigen statt kurz die leere Ansicht.
  // Offline Abgehaktes/Entferntes liegt in der Outbox und wird darübergelegt.
  const items = usePersistedQuery(api.shopping.getShoppingList, {}, 'shopping-list', overlayShoppingList);
  // Rezeptbilder nur in der Rezept-Ansicht; „Abteilungen“ kommt ohne aus.
  const recipes = useQuery(api.shopping.getShoppingRecipes, mode === 'recipes' && items && items.length > 0 ? {} : 'skip');

  // Optimistisch, damit Abhaken, Hinzufügen und Entfernen ohne Warten auf den Server sichtbar werden.
  // Abhaken und Entfernen gehen auch offline (Outbox), Hinzufügen und Bearbeiten nur online.
  const setChecked = useOfflineAwareMutation('shopping.setChecked', useMutation(api.shopping.setShoppingItemsChecked).withOptimisticUpdate((store, args) =>
    patchList(store, (list) => list.map((i) => (args.ids.includes(i._id) ? { ...i, checked: args.checked } : i))),
  ));
  const removeItems = useOfflineAwareMutation('shopping.remove', useMutation(api.shopping.removeShoppingItems).withOptimisticUpdate((store, args) =>
    patchList(store, (list) => list.filter((i) => !args.ids.includes(i._id))),
  ));
  const onlineOnly = useOnlineOnly();
  const updateItem = useMutation(api.shopping.updateShoppingItem).withOptimisticUpdate((store, args) =>
    patchList(store, (list) => list.map((i) => (i._id === args.id ? { ...i, name: args.name, amount: args.amount } : i))),
  );
  const quickAdd = useMutation(api.shopping.quickAddShoppingItem).withOptimisticUpdate((store, args) =>
    patchList(store, (list) => {
      const key = buildShoppingItemKey(args.name);
      if (list.some((i) => i.key === key)) {
        return list.map((i) => (i.key === key ? { ...i, checked: false, amount: args.amount ?? i.amount } : i));
      }
      const now = Date.now();
      const temp: ListValue[number] = {
        _id: `optimistic_${now}` as Id<'shoppingItems'>,
        _creationTime: now,
        name: args.name,
        normalizedName: key,
        amount: args.amount,
        key,
        checked: false,
        createdAt: now,
      };
      return [...list, temp];
    }),
  );

  const fail = (action: string) => (err: unknown) => {
    logger.error('Shopping', `${action} failed`, err);
    showToast(getUserErrorMessage(err, 'generic'), 'error');
  };

  const changeMode = (next: ShoppingMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Nur eine Vorliebe.
    }
  };

  return (
    <ShoppingListView
      items={items as ShoppingListViewItem[] | undefined}
      recipes={recipes}
      mode={mode}
      onModeChange={changeMode}
      onSetChecked={(ids, checked) => void setChecked({ ids: ids as Id<'shoppingItems'>[], checked }).catch(fail('check'))}
      onQuickAdd={(name, amount) => onlineOnly(() => void quickAdd({ name, amount }).catch(fail('add')))}
      onUpdate={(id, name, amount) => onlineOnly(() => void updateItem({ id: id as Id<'shoppingItems'>, name, amount }).catch(fail('update')))}
      onRemove={(list) => void removeItems({ ids: list.map((i) => i._id as Id<'shoppingItems'>) }).catch(fail('remove'))}
      emptyPath="/tabs/categories"
      recentsKey="cookly.shopping.recents"
    />
  );
};

export default ShoppingPage;
