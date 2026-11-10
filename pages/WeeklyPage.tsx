import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import MealPlanModal from '../components/MealPlanModal';
import WeeklyPlanView, { type WeekMeal } from '../components/weekly/WeeklyPlanView';
import { useModal } from '../contexts/ModalContext';
import { useNotification } from '../contexts/NotificationContext';
import { logger } from '../utils/logger';
import { getUserErrorMessage } from '../utils/userErrors';
import { addDays, fromDateString, longDay, slotLabel, toDateString, weekLabel, weekNumber, weekStartForOffset } from '../utils/weekPlan';

const WeeklyPage: React.FC = () => {
  const { showToast } = useNotification();
  const { isAddMealModalOpen, openAddMealModal, closeAddMealModal, addMealModalOptions } = useModal();

  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = weekStartForOffset(weekOffset);
  const startDate = toDateString(weekStart);
  const endDate = toDateString(addDays(weekStart, 6));
  const kw = weekNumber(weekStart);

  const weekResult = useQuery(api.weekly.getWeek, { startDate, endDate });
  // Beim Wochenwechsel die alte Woche gedimmt stehen lassen, bis die neue da ist (kein Flackern).
  const [lastMeals, setLastMeals] = useState<WeekMeal[]>([]);
  const meals = useMemo<WeekMeal[] | undefined>(
    () => weekResult?.map((m) => ({ ...m, scope: m.scope ?? 'day' })),
    [weekResult],
  );
  if (meals && meals !== lastMeals) setLastMeals(meals);
  const loading = meals === undefined;
  const displayed = meals ?? lastMeals;

  // „Vorwoche übernehmen“ braucht nur ein Ja/Nein und nur, wenn diese Woche leer ist.
  const previousStart = toDateString(addDays(weekStart, -7));
  const previousHasMeals = useQuery(
    api.weekly.hasMealsInRange,
    meals && meals.length === 0 ? { startDate: previousStart, endDate: toDateString(addDays(weekStart, -1)) } : 'skip',
  );
  const recipeIdsOnList = useQuery(api.shopping.getRecipeIdsOnList, meals && meals.length > 0 ? {} : 'skip');

  // Optimistisch, damit Verschieben und Entfernen ohne Warten auf den Server sichtbar werden.
  const moveMeals = useMutation(api.weekly.moveMeals).withOptimisticUpdate((store, args) => {
    for (const { args: queryArgs, value } of store.getAllQueries(api.weekly.getWeek)) {
      if (!value) continue;
      store.setQuery(api.weekly.getWeek, queryArgs, value.map((m) => (args.mealIds.includes(m.mealId) ? { ...m, date: args.date, scope: args.scope } : m)));
    }
  });
  const removeMeals = useMutation(api.weekly.removeMeals).withOptimisticUpdate((store, args) => {
    for (const { args: queryArgs, value } of store.getAllQueries(api.weekly.getWeek)) {
      if (value) store.setQuery(api.weekly.getWeek, queryArgs, value.filter((m) => !args.mealIds.includes(m.mealId)));
    }
  });
  const copyWeek = useMutation(api.weekly.copyWeek);
  const addRecipesToShoppingList = useMutation(api.shopping.addRecipesToShoppingList);

  const fail = (action: string) => (err: unknown) => {
    logger.error('Weekly', `${action} failed`, err);
    showToast(getUserErrorMessage(err, 'generic'), 'error');
  };

  // Reihenfolge wie im Plan, jedes Rezept einmal: So wischt man auf der Rezeptseite durch die Woche.
  const navIds = useMemo(() => {
    const ordered = [...displayed].sort((a, b) =>
      a.scope === b.scope ? a.date.localeCompare(b.date) : a.scope === 'day' ? -1 : 1,
    );
    return [...new Set(ordered.map((m) => m.recipe._id))];
  }, [displayed]);
  const onList = new Set<string>(recipeIdsOnList ?? []);
  const toShop = navIds.filter((id) => !onList.has(id));

  const plannedLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const m of displayed) labels[m.recipe._id] ??= slotLabel(m);
    return labels;
  }, [displayed]);

  return (
    <>
      <WeeklyPlanView
        weekOffset={weekOffset}
        onWeekOffsetChange={setWeekOffset}
        meals={displayed}
        loading={loading}
        canRepeatPreviousWeek={previousHasMeals === true}
        onRepeatPreviousWeek={() => {
          copyWeek({ sourceStartDate: previousStart, targetStartDate: startDate }).catch(fail('Copy week'));
        }}
        toShopCount={toShop.length}
        onAddToShopping={() => {
          addRecipesToShoppingList({ recipeIds: toShop })
            .then(({ itemsAdded }) => showToast(`${itemsAdded} Zutaten auf der Einkaufsliste.`, 'success'))
            .catch(fail('Add week to shopping list'));
        }}
        shoppingPath="/tabs/shopping"
        recipeLink={(recipeId) => ({
          to: `/recipe/${recipeId}`,
          state: { nav: { ids: navIds, index: navIds.indexOf(recipeId) }, from: 'weekly' },
        })}
        onAdd={(slot) => openAddMealModal({ date: slot.date, scope: slot.scope })}
        onMove={(list, slot) => {
          moveMeals({ mealIds: list.map((m) => m.mealId), ...slot }).catch(fail('Move meals'));
        }}
        onRemove={(list) => {
          removeMeals({ mealIds: list.map((m) => m.mealId) }).catch(fail('Remove meals'));
        }}
      />

      {isAddMealModalOpen && addMealModalOptions.date && (
        <MealPlanModal
          isOpen={isAddMealModalOpen}
          onClose={closeAddMealModal}
          mode="selectRecipes"
          date={addMealModalOptions.date}
          scope={addMealModalOptions.scope}
          plannedLabels={plannedLabels}
          formattedDate={
            addMealModalOptions.scope === 'week'
              ? `${weekLabel(weekOffset, kw)} · ohne festen Tag`
              : longDay(fromDateString(addMealModalOptions.date))
          }
        />
      )}
    </>
  );
};

export default WeeklyPage;
