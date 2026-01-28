import React from 'react';
import { Link } from 'react-router-dom';
import { Id } from '../convex/_generated/dataModel';
import SafeImage from './SafeImage';

export interface RecipeCardProps {
  recipe: {
    _id: Id<'recipes'>;
    title: string;
    image?: string;
    category: string;
    prepTimeMinutes: number;
    difficulty?: string;
    portions?: number;
  };
  index?: number;
  navIds?: Id<'recipes'>[];
  source?: 'favorites' | 'category' | 'search';
  className?: string;
}

/**
 * RecipeCard - Memoized component for recipe list items
 * Only re-renders when recipe._id or recipe data changes
 */
export const RecipeCard = React.memo<RecipeCardProps>(({ recipe, index = 0, navIds, source, className = '' }) => {
  const isCompact = source === 'category' || source === 'search';

  if (isCompact) {
    // Compact card for category/search views
    return (
      <Link
        to={`/recipe/${recipe._id}`}
        state={navIds ? { nav: { ids: navIds, index } } : undefined}
        className={`stagger-item touch-card flex items-center gap-4 radius-md bg-card-light p-3 elevation-2 dark:bg-card-dark ${className}`}
      >
        <div className="h-16 w-16 flex-shrink-0 radius-sm overflow-hidden">
          {recipe.image ? (
            <SafeImage
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-gray-400">restaurant</span>
            </div>
          )}
        </div>
        <div className="flex-grow min-w-0">
          <p className="text-body font-bold text-text-primary-light dark:text-text-primary-dark line-clamp-1">{recipe.title}</p>
          <div className="flex gap-2 text-caption text-text-secondary-light dark:text-text-secondary-dark mt-0.5">
            <span>{recipe.category}</span>
            <span>•</span>
            <span>{recipe.prepTimeMinutes} Min</span>
          </div>
        </div>
        <span className="material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark flex-shrink-0">chevron_right</span>
      </Link>
    );
  }

  // Full card for favorites view
  return (
    <Link
      to={`/recipe/${recipe._id}`}
      state={navIds ? { nav: { ids: navIds, index }, from: source } : undefined}
      className={`stagger-item touch-card flex flex-col gap-3 radius-md bg-card-light p-4 elevation-2 dark:bg-card-dark ${className}`}
    >
      <div className="w-full aspect-video radius-sm overflow-hidden relative">
        {recipe.image ? (
          <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-gray-400">restaurant</span>
          </div>
        )}
        <div className="absolute top-2 right-2 bg-white/80 dark:bg-black/60 backdrop-blur-sm px-2 py-1 radius-sm text-caption font-bold flex items-center gap-1">
          <span className="material-symbols-outlined filled text-sm text-red-500">favorite</span>
        </div>
      </div>
      <div>
        <h3 className="text-body font-bold text-text-primary-light dark:text-text-primary-dark line-clamp-2">{recipe.title}</h3>
        {recipe.difficulty && recipe.portions && (
          <div className="flex items-center gap-2 mt-1 text-body-sm text-text-secondary-light dark:text-text-secondary-dark">
            <span className={`px-2 py-0.5 rounded-full text-caption font-medium ${
              recipe.difficulty === 'Einfach' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
              recipe.difficulty === 'Mittel' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
              'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}>
              {recipe.difficulty}
            </span>
            <span>•</span>
            <span>{recipe.portions} Portionen</span>
          </div>
        )}
      </div>
    </Link>
  );
}, (prevProps, nextProps) => {
  // Only re-render if recipe ID or key properties change
  return prevProps.recipe._id === nextProps.recipe._id &&
    prevProps.recipe.title === nextProps.recipe.title &&
    prevProps.recipe.image === nextProps.recipe.image;
});

RecipeCard.displayName = 'RecipeCard';

export default RecipeCard;
