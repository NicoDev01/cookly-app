import React, { useState } from 'react';
import { Ingredient } from '../../../types';

// Labor-Kopie von components/Ingredients.tsx: Einkaufsliste lokal statt Convex.
interface IngredientsProps {
  ingredients: Ingredient[];
  highlightedIndex?: number | null;
}

const INGREDIENT_COLORS = [
  'bg-ingredient-1-bg', 'bg-ingredient-2-bg', 'bg-ingredient-3-bg', 'bg-ingredient-4-bg', 'bg-ingredient-5-bg',
  'bg-ingredient-6-bg', 'bg-ingredient-7-bg', 'bg-ingredient-8-bg', 'bg-ingredient-9-bg', 'bg-ingredient-10-bg',
];

const LabIngredients: React.FC<IngredientsProps> = ({ ingredients, highlightedIndex }) => {
  const [inList, setInList] = useState<Set<number>>(new Set());
  const toggle = (index: number) => setInList((prev) => {
    const next = new Set(prev);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  return (
    <div className="mt-6">
      <h2 className="text-xl font-bold mb-4 text-[#111718] dark:text-white">Zutaten</h2>
      <div className="flex flex-wrap gap-2.5">
        {ingredients.map((ing, index) => {
          const isInShoppingList = inList.has(index);
          const isHighlighted = highlightedIndex === index;
          return (
            <div
              key={`${ing.name}-${index}`}
              onClick={() => toggle(index)}
              className={`
                relative group cursor-pointer select-none transition-all duration-300 ease-out active:scale-95
                px-3 py-[5px] rounded-full text-sm font-medium
                ${INGREDIENT_COLORS[index % INGREDIENT_COLORS.length]}
                text-black dark:text-white
                shadow-neomorphism-pill dark:shadow-dark-neomorphism-pill
                ${isInShoppingList ? 'opacity-80' : 'opacity-100'}
                ${isHighlighted ? 'ring-2 ring-black/50 dark:ring-white/50 scale-105 z-10' : ''}
              `}
            >
              {ing.amount && <span>{ing.amount} </span>}
              {ing.name}
              <div className={`
                absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-white
                flex items-center justify-center shadow-sm border border-white dark:border-gray-800
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

export default LabIngredients;
