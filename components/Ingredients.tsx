import React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Ingredient } from '../types';

interface IngredientsProps {
  ingredients: Ingredient[];
  highlightedIndex?: number | null;
}

const Ingredients: React.FC<IngredientsProps> = ({ ingredients, highlightedIndex }) => {
  const shoppingItems = useQuery(api.shopping.getShoppingList);
  const toggleShoppingItem = useMutation(api.shopping.toggleShoppingItemByDetails).withOptimisticUpdate((localStore, args) => {
    const { name, amount } = args;
    const currentList = localStore.getQuery(api.shopping.getShoppingList);
    if (currentList) {
      const key = `${name.toLowerCase().trim().replace(/\s+/g, ' ')}|${amount ? amount.toLowerCase().trim().replace(/\s+/g, ' ') : ''}`;
      const exists = currentList.find(item => item.key === key);
      if (exists) {
        // Remove optimistically
        localStore.setQuery(api.shopping.getShoppingList, {}, currentList.filter(item => item.key !== key));
      } else {
        // Add optimistically
        localStore.setQuery(api.shopping.getShoppingList, {}, [...currentList, {
          _id: `optimistic-${Date.now()}` as any,
          key,
          name,
          amount,
          checked: false
        }]);
      }
    }
  });

  const normalize = (value: string) => value.toLowerCase().trim().replace(/\s+/g, ' ');
  const buildKey = (name: string, amount?: string) => `${normalize(name)}|${amount ? normalize(amount) : ''}`;

  const shoppingKeySet = React.useMemo(() => {
    if (!shoppingItems) return new Set<string>();
    return new Set(shoppingItems.map((i) => i.key));
  }, [shoppingItems]);

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
      <h2 className="text-xl font-bold mb-4 text-[#111718] dark:text-white">Zutaten</h2>
      <div className="flex flex-wrap gap-3"> {/* Increased gap slightly for the badges */}
        {ingredients.map((ing, index) => {
          // Defensive: ensure ing is an object with name property (AI might return unexpected format)
          const ingName = typeof ing === 'object' && ing !== null 
            ? (typeof ing.name === 'string' ? ing.name : String(ing.name ?? ''))
            : String(ing ?? '');
          const ingAmount = typeof ing === 'object' && ing !== null && typeof ing.amount === 'string' 
            ? ing.amount 
            : undefined;
          
          const isInShoppingList = shoppingKeySet.has(buildKey(ingName, ingAmount));
          const isHighlighted = highlightedIndex === index;

          return (
            <div 
              key={`${ingName}-${index}`}
              onClick={() => toggleShoppingItem({ name: ingName, amount: ingAmount })}
              className={`
                relative group cursor-pointer select-none transition-all duration-300 ease-out active:scale-95
                px-3 py-1.5 rounded-full text-sm font-medium 
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
