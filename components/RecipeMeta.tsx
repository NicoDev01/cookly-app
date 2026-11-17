import React from 'react';
import { Recipe } from '../types';
import { ChefHat, Minus, Plus } from 'lucide-react';

interface RecipeMetaProps {
  recipe: Recipe;
  /** Gewählte Portionen; die Rezeptseite rechnet die Zutaten darauf um. */
  selectedPortions: number;
  onPortionsChange: (portions: number) => void;
  onStartCooking?: () => void;
}

export const MIN_PORTIONS = 1;
export const MAX_PORTIONS = 50;

const RecipeMeta: React.FC<RecipeMetaProps> = ({ recipe, selectedPortions, onPortionsChange, onStartCooking }) => {
  // Defensive: ensure all values are renderable (not objects)
  const title = typeof recipe.title === 'string' ? recipe.title : String(recipe.title ?? '');
  const portions = typeof recipe.portions === 'number' ? recipe.portions : Number(recipe.portions) || 0;
  const canScale = portions > 0;
  const shownPortions = canScale ? selectedPortions : portions;
  const isScaled = canScale && shownPortions !== portions;

  return (
    <div className="mb-2">
      <h1 className="uppercase text-[#111718] dark:text-white tracking-tight text-3xl font-black leading-tight">
        {title}
      </h1>
      {/* Eine ruhige Zeile: Portionen · Kochmodus (Quelle sitzt als Pille im Bild, siehe RecipeSourcePill) */}
      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        {canScale ? (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <button
              type="button"
              aria-label="Eine Portion weniger"
              disabled={shownPortions <= MIN_PORTIONS}
              onClick={() => onPortionsChange(Math.max(MIN_PORTIONS, shownPortions - 1))}
              className="relative flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset ring-gray-300 transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-[#111718] hover:ring-[#111718] active:scale-90 disabled:opacity-30 dark:ring-gray-600"
            >
              <Minus size={10} strokeWidth={2.5} aria-hidden />
            </button>
            {/* Geänderte Zahl dunkler, damit man sieht, dass umgerechnet wird. */}
            <span className={isScaled ? 'font-semibold text-[#111718] dark:text-white' : undefined}>
              {shownPortions} {shownPortions === 1 ? 'Portion' : 'Portionen'}
            </span>
            <button
              type="button"
              aria-label="Eine Portion mehr"
              disabled={shownPortions >= MAX_PORTIONS}
              onClick={() => onPortionsChange(Math.min(MAX_PORTIONS, shownPortions + 1))}
              className="relative flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset ring-gray-300 transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-[#111718] hover:ring-[#111718] active:scale-90 disabled:opacity-30 dark:ring-gray-600"
            >
              <Plus size={10} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        ) : null}
        {/* Öffnet den Kochmodus (CookMode). */}
        <button
          type="button"
          onClick={onStartCooking}
          className="flex items-center gap-1 whitespace-nowrap rounded-full border border-solid border-gray-300 px-2.5 py-1 transition active:scale-95 hover:text-[#111718] dark:border-white/25 dark:hover:text-white"
        >
          <ChefHat size={13} strokeWidth={2.25} aria-hidden />
          Kochmodus
        </button>
      </div>
    </div>
  );
};

export default RecipeMeta;
