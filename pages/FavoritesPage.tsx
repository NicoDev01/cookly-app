import React from 'react';
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Link } from 'react-router-dom';

const FavoritesPage: React.FC = () => {
  const favoriteRecipes = useQuery(api.recipes.getFavorites, {});

  const favoriteIds = React.useMemo(() => {
    if (!favoriteRecipes) return [];
    return favoriteRecipes.map((r) => r._id);
  }, [favoriteRecipes]);


  return (
    <div className="page-enter relative flex w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark font-display">
      <div className="flex flex-col flex-1">

        {/* Header */}
        <div className="flex items-center px-6 py-3 gap-4" style={{ paddingTop: 'max(1.5rem, var(--safe-area-inset-top))' }}>
          <h1 className="text-headline text-text-primary-light dark:text-text-primary-dark">
            Favoriten
          </h1>
        </div>

        {/* Recipe List - PERFORMANCE (AC-1): Standard Grid statt Virtuoso für bessere Shadows */}
        <div className="pb-4">
          {favoriteRecipes && favoriteRecipes.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 pt-12 animate-in fade-in">
                 {/* Heart Icon with Headline */}
                 <div className="flex flex-col items-center">
                    {/* Animated Heart Icon */}
                    <span className="material-symbols-outlined text-8xl text-[#b1c8bb] animate-pulse mb-4">
                       favorite
                    </span>

                    {/* Headline */}
                    <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-center">
                       Noch keine <span className="text-primary italic">Favoriten</span>
                    </h2>
                 </div>

                 {/* Subtext */}
                 <p className="text-body text-text-secondary-light dark:text-text-secondary-dark text-center max-w-sm mt-4">
                   Speichere Rezepte, die dir gefallen, mit einem Klick auf das Herz-Symbol.
                </p>
                <p className="text-body text-text-secondary-light dark:text-text-secondary-dark text-center mb-8 max-w-sm">
                   So hast du sie schnell wieder zur Hand.
                </p>

                {/* CTA Button */}
                <Link
                   to="/tabs/categories"
                   className="flex items-center gap-2 px-6 py-3 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all touch-btn text-body font-semibold text-text-primary-light dark:text-text-primary-dark hover:text-primary"
                >
                   <span className="material-symbols-outlined">explore</span>
                   Rezepte entdecken
                </Link>
             </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-6 pb-4">
              {favoriteRecipes?.map((recipe, index) => (
                <Link
                  key={recipe._id}
                  to={`/recipe/${recipe._id}`}
                  state={{ nav: { ids: favoriteIds, index }, from: 'favorites' }}
                  className="flex flex-col gap-3 rounded-xl bg-card-light p-4 shadow-neo-light-convex dark:bg-card-dark dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all cursor-pointer group"
                >
                  <div className="w-full aspect-video rounded-lg overflow-hidden relative">
                     {recipe.image ? (
                       <img
                         src={recipe.image}
                         alt={recipe.title}
                         className="w-full h-full object-cover"
                         // PERFORMANCE (QW-4): Erstes Bild eager loaden für sofortige Sichtbarkeit
                         loading={index === 0 ? "eager" : "lazy"}
                         decoding="async"
                       />
                     ) : (
                       <div className="w-full h-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white shadow-inner">
                         <span className="material-symbols-outlined text-4xl drop-shadow-sm">restaurant</span>
                       </div>
                     )}
                     <div className="absolute top-2 right-2 bg-white/80 dark:bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-caption font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined filled text-sm text-red-500">favorite</span>
                     </div>
                  </div>
                  <div>
                    <h3 className="text-body font-bold text-text-primary-light dark:text-text-primary-dark line-clamp-2 group-hover:text-primary transition-colors">{recipe.title}</h3>
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
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div style={{ height: 'calc(var(--nav-height) + var(--safe-area-inset-bottom, 0px))' }} className="w-full shrink-0" />
      </div>
    </div>
  );
};

export default FavoritesPage;
