import React, { Suspense, lazy, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { OptimisticLocalStore } from 'convex/browser';
import { api } from '../convex/_generated/api';
import FavoritesView, { type FavoriteRecipe } from '../components/favorites/FavoritesView';
import { ModalLoader } from '../components/PageLoader';
import { useNotification } from '../contexts/NotificationContext';
import { usePersistedQuery } from '../hooks/usePersistedQuery';
import { logger } from '../utils/logger';
import { getUserErrorMessage } from '../utils/userErrors';
import { plannedLabels } from '../utils/favoritesView';
import { addDays, fromDateString, mondayOf, shortDay, toDateString } from '../utils/weekPlan';

const MealPlanModal = lazy(() => import('../components/MealPlanModal'));

const FAVORITES_ARGS = { favoritesOnly: true } as const;
type FavoritesValue = NonNullable<ReturnType<typeof useQuery<typeof api.recipes.listPreviews>>>;

const patchFavorites = (store: OptimisticLocalStore, fn: (list: FavoritesValue) => FavoritesValue) => {
  const current = store.getQuery(api.recipes.listPreviews, FAVORITES_ARGS);
  if (current) store.setQuery(api.recipes.listPreviews, FAVORITES_ARGS, fn(current));
};

const FavoritesPage: React.FC = () => {
  const { showToast } = useNotification();
  // Beim Tab-Wechsel das letzte Ergebnis zeigen statt kurz nichts (kein Flackern).
  const favorites = usePersistedQuery(api.recipes.listPreviews, FAVORITES_ARGS, 'favorites');
  const [planFor, setPlanFor] = useState<FavoriteRecipe | null>(null);

  // Aktuelle Woche für den Hinweis „schon eingeplant“; die Abfrage liefert nur schlanke Vorschauen.
  const today = new Date();
  const weekStart = mondayOf(today);
  const week = useQuery(
    api.weekly.getWeek,
    favorites && favorites.length > 0 ? { startDate: toDateString(weekStart), endDate: toDateString(addDays(weekStart, 6)) } : 'skip',
  );
  const todayString = toDateString(today);
  const planned = useMemo(
    () =>
      plannedLabels(
        (week ?? []).map((meal) => ({ recipeId: meal.recipe._id, date: meal.date, scope: meal.scope ?? 'day' })),
        todayString,
        (date) => shortDay(fromDateString(date)),
      ),
    [week, todayString],
  );

  // Optimistisch: Entfernen wirkt sofort.
  const setFavorite = useMutation(api.recipes.setFavorite).withOptimisticUpdate((store, args) =>
    patchFavorites(store, (list) => (args.isFavorite ? list : list.filter((r) => r._id !== args.id))),
  );
  const addToShopping = useMutation(api.shopping.addRecipesToShoppingList);

  const fail = (action: string) => (err: unknown) => {
    logger.error('Favorites', `${action} failed`, err);
    showToast(getUserErrorMessage(err, 'generic'), 'error');
  };

  return (
    <>
      <FavoritesView
        recipes={favorites}
        plannedLabels={planned}
        onUnfavorite={(recipe) => void setFavorite({ id: recipe._id, isFavorite: false }).catch(fail('Unfavorite'))}
        onPlan={setPlanFor}
        onAddToShopping={async (recipe) => (await addToShopping({ recipeIds: [recipe._id] })).recipesAdded > 0}
        storageKey="cookly.favorites"
        emptyPath="/tabs/categories"
        searchAllPath="/tabs/categories"
      />
      {planFor && (
        <Suspense fallback={<ModalLoader label="Wochenplan lädt..." />}>
          <MealPlanModal isOpen onClose={() => setPlanFor(null)} mode="selectDay" recipeId={planFor._id} recipeTitle={planFor.title} recipeImage={planFor.image} />
        </Suspense>
      )}
    </>
  );
};

export default FavoritesPage;
