import React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { Ingredient } from '../types';
import { buildLegacyShoppingItemKeys, buildShoppingItemKey } from '../utils/shoppingListView';

interface IngredientsProps {
  ingredients: Ingredient[];
  highlightedIndex?: number | null;
  recipeId?: Id<"recipes">;
  recipeTitle?: string;
}

const Ingredients: React.FC<IngredientsProps> = ({ ingredients, highlightedIndex, recipeId, recipeTitle }) => {
  const shoppingItems = useQuery(api.shopping.getShoppingList);
  const toggleShoppingItem = useMutation(api.shopping.toggleShoppingItemByDetails).withOptimisticUpdate((localStore, args) => {
    const { name, amount } = args;
    const currentList = localStore.getQuery(api.shopping.getShoppingList);
    if (currentList) {
      const key = buildShoppingItemKey(name, amount, recipeId);
      const candidateKeys = new Set([key, ...buildLegacyShoppingItemKeys(name, amount, recipeId)]);
      const exactExists = currentList.find(item => item.key === key);
      const legacyExists = currentList.find(item => item.key !== key && candidateKeys.has(item.key));
      if (exactExists) {
        // Remove optimistically
        localStore.setQuery(api.shopping.getShoppingList, {}, currentList.filter(item => item.key !== key));
      } else if (legacyExists && recipeId) {
        localStore.setQuery(api.shopping.getShoppingList, {}, currentList.map((item) => (
          item._id === legacyExists._id
            ? { ...item, key, recipeId, recipeTitle, amount }
            : item
        )));
      } else if (legacyExists) {
        localStore.setQuery(api.shopping.getShoppingList, {}, currentList.filter(item => item._id !== legacyExists._id));
      } else {
        const createdAt = currentList.reduce((latest, item) => Math.max(latest, item.createdAt), 0) + 1;
        // Add optimistically
        localStore.setQuery(api.shopping.getShoppingList, {}, [...currentList, {
          _id: `optimistic-${key}` as Id<"shoppingItems">,
          _creationTime: createdAt,
          key,
          name,
          normalizedName: name.toLowerCase().trim(),
          amount,
          checked: false,
          recipeId,
          recipeTitle,
          createdAt,
        }]);
      }
    }
  });

  const shoppingKeySet = React.useMemo(() => {
    if (!shoppingItems) return new Set<string>();
    return new Set(shoppingItems.map((i) => i.key));
  }, [shoppingItems]);

  // Name und Menge robust lesen (KI liefert gelegentlich unerwartete Formate).
  const rows = ingredients.map((ing) => {
    const name = typeof ing === 'object' && ing !== null
      ? (typeof ing.name === 'string' ? ing.name : String(ing.name ?? ''))
      : String(ing ?? '');
    const amount = typeof ing === 'object' && ing !== null && typeof ing.amount === 'string' ? ing.amount : undefined;
    const key = buildShoppingItemKey(name, amount, recipeId);
    const onList = shoppingKeySet.has(key) || buildLegacyShoppingItemKeys(name, amount, recipeId).some((k) => shoppingKeySet.has(k));
    return { name, amount, key, onList };
  });
  const missing = rows.filter((row, index) => row.name.trim() && !row.onList && rows.findIndex((r) => r.key === row.key) === index);
  const selectedCount = rows.filter((row) => row.onList).length;

  // „Alle“: fehlende Zutaten sofort anzeigen, der Server ergänzt nur, was noch fehlt.
  const addAll = useMutation(api.shopping.addRecipesToShoppingList).withOptimisticUpdate((localStore) => {
    const currentList = localStore.getQuery(api.shopping.getShoppingList);
    if (!currentList) return;
    let createdAt = currentList.reduce((latest, item) => Math.max(latest, item.createdAt), 0);
    localStore.setQuery(api.shopping.getShoppingList, {}, [...currentList, ...missing.map((row) => {
      createdAt += 1;
      return {
        _id: `optimistic-${row.key}` as Id<"shoppingItems">,
        _creationTime: createdAt,
        key: row.key,
        name: row.name.trim(),
        normalizedName: row.name.trim().toLowerCase(),
        amount: row.amount,
        checked: false,
        recipeId,
        recipeTitle,
        createdAt,
      };
    })]);
  });
  const showSelectAll = !!recipeId && selectedCount > 0;

  // Helper to cycle through colors defined in tailwind config for visual variety
  const INGREDIENT_COLORS = [
    'bg-ingredient-1-bg',
    'bg-ingredient-2-bg',
    'bg-ingredient-3-bg',
    'bg-ingredient-4-bg',
    'bg-ingredient-5-bg',
    'bg-ingredient-6-bg',
    'bg-ingredient-7-bg',
    'bg-ingredient-8-bg',
    'bg-ingredient-9-bg',
    'bg-ingredient-10-bg',
  ];

  const getColorClass = (index: number) => {
    return INGREDIENT_COLORS[index % INGREDIENT_COLORS.length];
  };

  return (
    <div className="mt-6">
      <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[#111718] dark:text-white">Zutaten</h2>
        {/* Erscheint, sobald eine Zutat auf der Liste steht: der Rest mit einem Tipp. */}
        {showSelectAll && (
          <button
            type="button"
            disabled={!missing.length}
            onClick={() => recipeId && void addAll({ recipeIds: [recipeId] })}
            aria-label={missing.length ? `Alle ${missing.length} fehlenden Zutaten auf die Einkaufsliste` : 'Alle Zutaten stehen auf der Einkaufsliste'}
            className={`flex h-8 items-center gap-1.5 rounded-full pl-2 pr-3 text-xs font-semibold transition-all duration-300 ease-out animate-in fade-in zoom-in-90 active:scale-95 ${
              missing.length
                ? 'bg-primary/10 text-primary shadow-neomorphism-pill dark:shadow-dark-neomorphism-pill'
                : 'text-text-secondary-light dark:text-text-secondary-dark'
            }`}
          >
            <span className={`material-symbols-outlined !text-[16px] leading-none transition-transform duration-300 ${missing.length ? '' : 'scale-110'}`}>
              {missing.length ? 'done_all' : 'check_circle'}
            </span>
            {missing.length ? `Alle · +${missing.length}` : 'Alle drauf'}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2.5">
        {rows.map(({ name: ingName, amount: ingAmount, onList: isInShoppingList }, index) => {
          const isHighlighted = highlightedIndex === index;

          return (
            <div 
              key={`${ingName}-${index}`}
              onClick={() => toggleShoppingItem({ name: ingName, amount: ingAmount, recipeId })}
              className={`
                relative group cursor-pointer select-none transition-all duration-300 ease-out active:scale-95
                px-3 py-[5px] rounded-full text-sm font-medium 
                ${getColorClass(index)} 
                text-black dark:text-white 
                shadow-neomorphism-pill dark:shadow-dark-neomorphism-pill
                ${isInShoppingList ? 'opacity-80' : 'opacity-100'}
                ${isHighlighted ? 'ring-2 ring-black/50 dark:ring-white/50 scale-105 z-10' : ''}
              `}
            >
              {ingAmount && <span>{ingAmount} </span>}
              {ingName}

              {/* Shopping Badge */}
              <div className={`
                absolute -top-1.5 -right-1.5 
                w-5 h-5 rounded-full 
                bg-primary text-white 
                flex items-center justify-center
                shadow-sm border border-white dark:border-gray-800
                transition-all duration-300 ease-out
                ${isInShoppingList ? 'scale-100 opacity-100 rotate-0' : 'scale-0 opacity-0 -rotate-45'}
              `}>
                <span className="material-symbols-outlined !text-[10px] leading-none">shopping_cart</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Ingredients;
