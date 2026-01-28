import React from 'react';
import { Recipe } from '../types';

interface RecipeMetaProps {
  recipe: Recipe;
}

const RecipeMeta: React.FC<RecipeMetaProps> = ({ recipe }) => {
  // Defensive: ensure all values are renderable (not objects)
  const title = typeof recipe.title === 'string' ? recipe.title : String(recipe.title ?? '');
  const prepTime = typeof recipe.prepTimeMinutes === 'number' ? recipe.prepTimeMinutes : Number(recipe.prepTimeMinutes) || 0;
  const difficulty = typeof recipe.difficulty === 'string' ? recipe.difficulty : String(recipe.difficulty ?? '');
  const portions = typeof recipe.portions === 'number' ? recipe.portions : Number(recipe.portions) || 0;

  // Determine source type (Instagram vs. Website)
  const isInstagram = recipe.sourceUrl?.includes('instagram.com');
  const sourceIcon = isInstagram ? 'smart_display' : 'language';
  const sourceLabel = isInstagram ? 'IG' : 'Web';

  return (
    <div className="mb-2">
      <h1 className="uppercase  text-[#111718] dark:text-white tracking-tight text-3xl font-black leading-tight">
        {title}
      </h1>
      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-0.5 whitespace-nowrap">
          <span className="material-symbols-outlined !text-sm">timer</span>
          <span>{prepTime} Min</span>
        </div>
        <div className="flex items-center gap-0.5 whitespace-nowrap">
          <span>{difficulty}</span>
        </div>
        <div className="flex items-center gap-0.5 whitespace-nowrap">
          <span className="material-symbols-outlined !text-sm">groups</span>
          <span>{portions} Portionen</span>
        </div>
        {recipe.sourceUrl && (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 whitespace-nowrap hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="material-symbols-outlined !text-sm">{sourceIcon}</span>
            <span>{sourceLabel}</span>
          </a>
        )}
      </div>
    </div>
  );
};

export default RecipeMeta;