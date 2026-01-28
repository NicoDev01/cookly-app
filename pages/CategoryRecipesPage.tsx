import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import ImageWithBlurhash from '../components/ImageWithBlurhash';
import { prefetchRecipePage } from '../prefetch';


const CategoryRecipesPage: React.FC = () => {
  const { category } = useParams<{ category: string }>();
  const handleBack = useBackNavigation();
  
  const isAll = category === 'all';
  const decodedCategory = category && !isAll ? decodeURIComponent(category) : undefined;

  const [sortOption, setSortOption] = React.useState<'alphabetical' | 'recent'>(() => {
    const saved = localStorage.getItem('recipeSortOption');
    return (saved === 'alphabetical' || saved === 'recent') ? saved : 'alphabetical';
  });
  const [isSortMenuOpen, setIsSortMenuOpen] = React.useState(false);
  const [selectedRecipes, setSelectedRecipes] = React.useState<Set<Id<"recipes">>>(new Set());
  const deleteRecipes = useMutation(api.recipes.deleteRecipes);
  
  // Long Press State
  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = React.useRef(false);
  const startPosRef = React.useRef<{x: number, y: number} | null>(null);

  React.useEffect(() => {
    localStorage.setItem('recipeSortOption', sortOption);
  }, [sortOption]);

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [category]);

  const listArgs = React.useMemo(() => {
    if (isAll) return { includeIngredients: false } as const;
    if (!decodedCategory) return "skip" as const;
    return { category: decodedCategory, includeIngredients: false };
  }, [isAll, decodedCategory]);

  const rawRecipes = useQuery(api.recipes.list, listArgs);

  const recipes = React.useMemo(() => {
    if (!rawRecipes) return undefined;
    if (isAll) {
      const sorted = [...rawRecipes];
      if (sortOption === 'alphabetical') {
        sorted.sort((a, b) => a.title.localeCompare(b.title));
      } else {
        sorted.sort((a, b) => b._creationTime - a._creationTime);
      }
      return sorted;
    }
    return rawRecipes;
  }, [rawRecipes, isAll, sortOption]);

  const recipeIds = React.useMemo(() => {
    if (!recipes) return [];
    return recipes.map((r) => r._id);
  }, [recipes]);

  const toggleRecipeSelection = React.useCallback((recipeId: Id<"recipes">) => {
    setSelectedRecipes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recipeId)) {
        newSet.delete(recipeId);
      } else {
        newSet.add(recipeId);
      }
      return newSet;
    });
  }, []);

  const handlePointerDown = (e: React.PointerEvent, recipeId: Id<"recipes">) => {
    isLongPressRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(50);
      
      // Wenn noch nichts ausgewählt ist, starte Auswahlmodus mit diesem Item
      // Wenn schon Auswahlmodus aktiv ist, toggle dieses Item (optional, aber intuitiv)
      toggleRecipeSelection(recipeId);
    }, 500); // 500ms für Long Press
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (startPosRef.current) {
      const moveX = Math.abs(e.clientX - startPosRef.current.x);
      const moveY = Math.abs(e.clientY - startPosRef.current.y);
      // Wenn Finger sich mehr als 10px bewegt, brich Long Press ab (Scrollen)
      if (moveX > 10 || moveY > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent, recipeId: Id<"recipes">) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    startPosRef.current = null;
  };

  const handlePointerLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    startPosRef.current = null;
  };

  const handleClick = (e: React.MouseEvent, recipeId: Id<"recipes">) => {
    // Wenn Long Press erkannt wurde, ignoriere den Click (wurde schon im Timer behandelt)
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Wenn Auswahlmodus aktiv ist
    if (selectedRecipes.size > 0) {
      e.preventDefault(); // Keine Navigation
      e.stopPropagation();
      toggleRecipeSelection(recipeId);
    }
    // Sonst normale Navigation (Link Verhalten)
  };

  const handleDeleteSelected = async () => {
    if (selectedRecipes.size === 0) return;

    const idsToDelete = Array.from(selectedRecipes) as Id<"recipes">[];
    // Direct deletion without confirmation - user already clicked delete button
    await deleteRecipes({ ids: idsToDelete });
    setSelectedRecipes(new Set());
  };

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col group/design-root overflow-x-hidden bg-background-light dark:bg-background-dark font-display pb-nav">
      <div className="flex flex-col flex-1 pb-24">
        
        {/* Header */}
        <div className="flex items-center px-6 py-4 pt-[calc(max(1rem,var(--safe-area-inset-top))+1rem)] justify-between relative z-30 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md sticky top-0">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave active:scale-95 transition-colors transition-shadow duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span className="material-symbols-outlined !text-2xl">arrow_back</span>
            </button>
            <h1 className="text-text-primary-light dark:text-text-primary-dark tracking-tight text-2xl font-black leading-tight truncate max-w-[180px]">
              {isAll ? 'Alle Rezepte' : decodedCategory}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {selectedRecipes.size > 0 && (
              <button
                onClick={() => handleDeleteSelected()}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500 text-white shadow-lg active:scale-90 transition-all"
              >
                <span className="material-symbols-outlined">delete</span>
              </button>
            )}
            {isAll && (
              <div className="relative">
                <button
                  onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all active:scale-90"
                >
                  <span className="material-symbols-outlined">sort</span>
                </button>

                {isSortMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsSortMenuOpen(false)} />
                    <div className="absolute right-0 top-12 z-20 w-56 rounded-xl bg-card-light dark:bg-card-dark shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                      <button
                        onClick={() => { setSortOption('alphabetical'); setIsSortMenuOpen(false); }}
                        className={`w-full px-4 py-3 text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 ${sortOption === 'alphabetical' ? 'text-primary font-medium' : 'text-text-primary-light dark:text-text-primary-dark'}`}
                      >
                        <span>Alphabetisch</span>
                        {sortOption === 'alphabetical' && <span className="material-symbols-outlined text-sm">check</span>}
                      </button>
                      <button
                        onClick={() => { setSortOption('recent'); setIsSortMenuOpen(false); }}
                        className={`w-full px-4 py-3 text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 ${sortOption === 'recent' ? 'text-primary font-medium' : 'text-text-primary-light dark:text-text-primary-dark'}`}
                      >
                        <span>Zuletzt hinzugefügt</span>
                        {sortOption === 'recent' && <span className="material-symbols-outlined text-sm">check</span>}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="pb-4">
          {recipes === undefined ? (
             <div className="flex items-center justify-center py-20">
               <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
             </div>
          ) : recipes.length === 0 ? (
             <div className="text-center p-10 text-text-secondary-light">Keine Rezepte in dieser Kategorie.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-6 pb-24">
              {recipes.map((recipe, index) => {
                const isSelected = selectedRecipes.has(recipe._id);
                const isSelectionMode = selectedRecipes.size > 0;

                return (
                  <div
                    key={recipe._id}
                    onPointerDown={(e) => handlePointerDown(e, recipe._id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={(e) => handlePointerUp(e, recipe._id)}
                    onPointerLeave={handlePointerLeave}
                    onContextMenu={(e) => {
                      e.preventDefault(); // Verhindert Kontextmenü bei Long Press
                    }}
                  >
                    <Link
                      to={`/recipe/${recipe._id}`}
                      state={{ nav: { ids: recipeIds, index }, fromCategory: isAll ? 'all' : decodedCategory }}
                      onClick={(e) => handleClick(e, recipe._id)}
                      onPointerEnter={() => { void prefetchRecipePage(); }}
                      onFocus={() => { void prefetchRecipePage(); }}
                      className={`flex items-center gap-4 rounded-xl p-3 select-none transition-all group ${
                        isSelected
                          ? 'bg-gray-200 dark:bg-gray-800 shadow-inner'
                          : 'bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave'
                      }`}
                      style={{ touchAction: 'pan-y' }} // Erlaubt vertikales Scrollen, verhindert Browser-Gesten
                    >
                      <div className="h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden relative">
                         {recipe.image ? (
                           <ImageWithBlurhash
                             src={recipe.image}
                             blurhash={recipe.imageBlurhash}
                             alt={recipe.title}
                             className={`w-full h-full object-cover ${isSelected ? 'opacity-50' : ''}`}
                             // PERFORMANCE (QW-4): Erstes Bild eager loaden
                             loading={index === 0 ? "eager" : "lazy"}
                           />
                         ) : (
                           <div className={`w-full h-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white shadow-inner ${isSelected ? 'opacity-50' : ''}`}>
                             <span className="material-symbols-outlined text-2xl drop-shadow-sm">restaurant</span>
                           </div>
                         )}

                         {/* Overlay Icon für Selektion */}
                         {isSelected && (
                           <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                             <span className="material-symbols-outlined text-primary text-3xl drop-shadow-md">check_circle</span>
                           </div>
                         )}
                      </div>

                      <div className={`flex-grow ${isSelected ? 'opacity-50' : ''}`}>
                        <p className="text-body font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">{recipe.title}</p>
                        <div className="flex items-center gap-2 text-body-sm text-text-secondary-light dark:text-text-secondary-dark">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium text-black dark:text-white shadow-neomorphism-pill dark:shadow-dark-neomorphism-pill ${
                            recipe.difficulty === 'Einfach' ? 'bg-ingredient-2-bg' :
                            recipe.difficulty === 'Mittel' ? 'bg-ingredient-1-bg' :
                            'bg-ingredient-3-bg'
                          }`}>
                            {recipe.difficulty}
                          </span>
                          <span>•</span>
                          <span>{recipe.prepTimeMinutes} Min</span>
                        </div>
                      </div>

                      {!isSelectionMode && (
                        <span className="material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark flex-shrink-0 group-hover:translate-x-1 transition-transform">chevron_right</span>
                      )}

                      {isSelectionMode && !isSelected && (
                        <span className="material-symbols-outlined text-gray-300 dark:text-gray-600">radio_button_unchecked</span>
                      )}

                      {isSelectionMode && isSelected && (
                         <span className="material-symbols-outlined text-primary">check_circle</span>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
};

export default CategoryRecipesPage;
