import React, { useState, startTransition } from 'react';
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Link, useSearchParams } from 'react-router-dom';
import SafeImage from '../components/SafeImage';
import EmptyState from '../components/EmptyState';
import { prefetchCategoryRecipesPage, prefetchRecipePage } from '../prefetch';
import { useDebounce } from 'use-debounce';
import { useModal } from '../contexts/ModalContext';


interface CategoryImageCache {
  [categoryName: string]: string | null | false; // null = loading, string = URL, false = failed (don't retry)
}

const CategoriesPage: React.FC = () => {
  const { openAddModal } = useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = React.useState("");
  // PERFORMANCE (QW-5): Debounce auf 300ms erhöht für weniger Query-Aufrufe
  const [debouncedSearch] = useDebounce(searchQuery, 300);
  const [categoryImageCache, setCategoryImageCache] = useState<CategoryImageCache>({});
  


  // PERFORMANCE (QW-2): NICHT für Kategorien verwenden!
  // Kategorien ändern sich (Bilder werden nachträglich hinzugefügt)
  // useCachedQuery würde alte Daten ohne Bilder zurückgeben
  const categoriesWithStats = useQuery(api.categories.getCategoriesWithStats, {});
  const categoriesLoading = categoriesWithStats === undefined;

  // Migration: Backfill stats for existing users
  const syncStats = useMutation(api.recipes.backfillCategoryStats);
  React.useEffect(() => {
    if (categoriesWithStats && categoriesWithStats.length > 0) {
      const totalCount = categoriesWithStats.reduce((sum, c) => sum + c.count, 0);
      if (totalCount === 0) {
        syncStats();
      }
    }
  }, [categoriesWithStats, syncStats]);

  const selectedIngredients = React.useMemo(() => {
    const raw = searchParams.get("ingredients");
    return raw ? raw.split(",") : [];
  }, [searchParams]);

  const setSelectedIngredients = (newIngredients: string[]) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (newIngredients.length > 0) {
        next.set("ingredients", newIngredients.join(","));
      } else {
        next.delete("ingredients");
      }
      return next;
    });
  };

  const [ingredientInput, setIngredientInput] = React.useState("");
  const [isFilterOpen, setIsFilterOpen] = React.useState(() => !!searchParams.get("ingredients"));

  const isFiltering = debouncedSearch.length > 0 || selectedIngredients.length > 0;

  const stats = categoriesWithStats;
  // Fallback: Immer alle Rezepte laden wenn keine Kategorien in der DB
  const hasCategoriesInDb = stats && stats.length > 0;
  const allRecipes = useQuery(
    api.recipes.list,
    // Immer laden wenn keine Kategorien in DB, sonst nur beim Filtern
    !hasCategoriesInDb || isFiltering ? {
      includeIngredients: isFiltering && selectedIngredients.length > 0,
      search: debouncedSearch
    } : "skip"
  );

  const getColorClass = (index: number) => {
    const colorIndex = (index % 6) + 1;
    return `bg-ingredient-${colorIndex}-bg`;
  };

  const getRecipeCount = (category: string) => {
    if (stats) {
      if (category === "Alle Rezepte") {
        // stats ist jetzt ein Array, total berechnen
        return stats.reduce((sum, cat) => sum + cat.count, 0);
      }
      const cat = stats.find(c => c.name === category);
      return cat ? cat.count : 0;
    }
    if (!allRecipes) return 0;
    return allRecipes.filter(r => r.category === category).length;
  };

  const categoriesList = React.useMemo(() => {
    let list: any[] = [];
    // stats ist jetzt ein Array von Kategorie-Objekten
    if (stats && Array.isArray(stats)) {
      list = [...stats];
    } else if (allRecipes) {
      const uniqueCats = Array.from(new Set(allRecipes.map(r => r.category))).sort();
      list = uniqueCats.map(name => ({ name, count: 0, image: undefined as string | undefined }));
    }
    
    // Total count calculation
    const totalCount = stats && Array.isArray(stats)
      ? stats.reduce((sum, cat) => sum + cat.count, 0)
      : (allRecipes?.length || 0);

    // Add "All Recipes" as the first item
    return [
      { name: 'ALL_RECIPES_SPECIAL', count: totalCount, image: undefined },
      ...list
    ];
  }, [stats, allRecipes]);

  const isEmptyState = !categoriesLoading && !isFiltering && categoriesList.length > 0 && categoriesList[0].count === 0;

  const filteredRecipes = React.useMemo(() => {
    if (!allRecipes) return [];
    let result = allRecipes as any[];
    if (selectedIngredients.length > 0) {
      result = result.filter(r =>
        selectedIngredients.every(filterIng =>
          r.ingredients?.some((rIng: any) => rIng.name.toLowerCase().includes(filterIng.toLowerCase())) ?? false
        )
      );
    }
    return result;
  }, [allRecipes, searchQuery, selectedIngredients]);

  const filteredIds = React.useMemo(() => {
    return filteredRecipes.map((r) => r._id);
  }, [filteredRecipes]);

  const handleAddIngredient = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && ingredientInput.trim()) {
      if (!selectedIngredients.includes(ingredientInput.trim())) {
        setSelectedIngredients([...selectedIngredients, ingredientInput.trim()]);
      }
      setIngredientInput("");
    }
  };

  const removeIngredient = (ing: string) => {
    setSelectedIngredients(selectedIngredients.filter(i => i !== ing));
  };

  // CRITICAL: Initialisiere Cache mit DB-Bildern wenn stats sich ändert
  // Dieser Effect hängt nur von stats ab, nicht vom Cache selbst!
  React.useEffect(() => {
    if (stats && Array.isArray(stats)) {
      setCategoryImageCache(prev => {
        const updated = { ...prev };
        stats.forEach(category => {
          // Nur aktualisieren wenn:
          // 1. DB hat ein Bild UND
          // 2. Cache ist noch leer ODER hat den Wert "false" (fehlerhaft)
          if (category.image && (prev[category.name] === undefined || prev[category.name] === false)) {
            updated[category.name] = category.image;
          }
        });
        return updated;
      });
    }
  }, [stats]); // Nur von stats abhängig!

  return (
    <div className="page-enter relative flex w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark font-display">
      <div className="flex flex-col flex-1">

        {!isEmptyState && (
          <div className="flex items-center px-6 pt-4 pb-2" style={{ paddingTop: 'max(1rem, var(--safe-area-inset-top))' }}>
            <img
              src="/logo.png"
              alt="Cookly"
              className="h-10 w-auto"
            />
          </div>
        )}

        {!isEmptyState && (
          <>
            {/* Search Bar */}
            <div className="px-6 py-2">
              <form
                onSubmit={(e) => e.preventDefault()}
                className="flex items-stretch rounded-xl h-12 bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex transition-all duration-200 focus-within:bg-primary/10 focus-within:shadow-none focus-within:ring-2 focus-within:ring-primary group"
              >
                <label htmlFor="global-search" className="sr-only">Rezepte suchen</label>
                <div className="text-text-secondary-light dark:text-text-secondary-dark group-focus-within:text-primary flex items-center justify-center pl-4 transition-colors">
                  <span className="material-symbols-outlined">search</span>
                </div>
                <input
                  id="global-search"
                  name="search"
                  className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:ring-transparent text-black dark:text-white placeholder:text-text-secondary-light dark:placeholder:text-text-secondary-dark px-4 text-base transition-all"
                  placeholder="Suche nach Rezepten..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value); // Immediate update for input
                    startTransition(() => {
                      // Debounced search runs in background via useDebouncedValue
                    });
                  }}
                  autoComplete="on"
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  inputMode="text"
                />
              </form>
            </div>

            {/* Page Title */}
            <h1 className="text-text-primary-light dark:text-text-primary-dark text-[26px] font-bold px-6 pt-2 pb-2">
              {isFiltering ? 'Suchergebnisse' : 'Kategorien'}
            </h1>

            <div className="px-6 py-2">
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`touch-btn flex items-center gap-2 rounded-xl px-4 py-2.5 transition-colors ${isFilterOpen || selectedIngredients.length > 0 ? 'bg-primary/10 text-primary' : 'text-text-secondary-light dark:text-text-secondary-dark'}`}
              >
                <span className="material-symbols-outlined text-xl">filter_list</span>
                <span className="text-sm font-medium">Filtern nach Zutaten</span>
              </button>

              {isFilterOpen && (
                <div className="mt-3 animate-in fade-in slide-in-from-top-2 space-y-3">
                  <form onSubmit={(e) => { e.preventDefault(); }}>
                    <label htmlFor="ingredient-filter" className="sr-only">Zutat filtern</label>
                    <input
                      id="ingredient-filter"
                      name="ingredient"
                      autoFocus
                      className="w-full bg-card-light dark:bg-card-dark border-0 rounded-xl p-4 text-black dark:text-white shadow-inner focus:ring-2 focus:ring-primary focus:shadow-primary-glow text-base transition-all"
                      placeholder="Zutat eingeben und Enter drücken..."
                      value={ingredientInput}
                      onChange={(e) => setIngredientInput(e.target.value)}
                      onKeyDown={handleAddIngredient}
                      autoComplete="on"
                      autoCorrect="on"
                      autoCapitalize="sentences"
                      spellCheck={true}
                      inputMode="text"
                    />
                  </form>

                  {selectedIngredients.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedIngredients.map((ing, idx) => (
                        <span
                          key={ing}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${getColorClass(idx)} text-black dark:text-white shadow-sm`}
                        >
                          {ing}
                          <button onClick={() => removeIngredient(ing)} className="touch-btn hover:text-red-500 ml-0.5 p-0.5">
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="pb-4">
          {isFiltering ? (
            filteredRecipes.length === 0 ? (
              <div className="text-center py-12 text-text-secondary-light dark:text-text-secondary-dark">
                <span className="material-symbols-outlined text-5xl mb-3 block opacity-50">search_off</span>
                Keine Rezepte gefunden.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 p-6 pb-4">
                {filteredRecipes.map((recipe, index) => (
                  <Link
                    key={recipe._id}
                    to={`/recipe/${recipe._id}`}
                    state={{ nav: { ids: filteredIds, index }, fromCategory: 'all' }}
                    onPointerEnter={() => { void prefetchRecipePage(); }}
                    onFocus={() => { void prefetchRecipePage(); }}
                    onTouchStart={() => { void prefetchRecipePage(); }}
                    className="flex items-center gap-4 rounded-xl bg-card-light p-3 shadow-neo-light-convex dark:bg-card-dark dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all cursor-pointer group"
                  >
                    <div className="h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden relative">
                      {recipe.image ? (
                        <SafeImage
                          src={recipe.image}
                          alt={recipe.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white shadow-inner">
                          <span className="material-symbols-outlined text-2xl drop-shadow-sm">restaurant</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-grow">
                      <p className="text-body font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">{recipe.title}</p>
                      <div className="flex gap-2 text-body-sm text-text-secondary-light dark:text-text-secondary-dark">
                        <span>{recipe.category}</span>
                        <span>•</span>
                        <span>{recipe.prepTimeMinutes} Min</span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark flex-shrink-0 group-hover:translate-x-1 transition-transform">chevron_right</span>
                  </Link>
                ))}
              </div>
            )
          ) : (
            <>


              {/* Loading State - zeige nur wenn am Laden und noch keine Daten */}
              {categoriesLoading && (!stats || stats.length === 0) && (
                <div className="flex items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Empty State - zeige wenn keine Rezepte vorhanden */}
              {!categoriesLoading && !isFiltering && categoriesList.length > 0 && categoriesList[0].count === 0 && (
                <EmptyState openAddModal={openAddModal} />
              )}

              {/* PERFORMANCE (AC-1): Virtualisierte Kategorien-Liste */}
              {categoriesList.length > 0 && (
                <div className="grid grid-cols-1 gap-4 p-6 pb-4 pt-4">
                  {categoriesList.map((category) => {
                    // Special case for "Alle Rezepte" card
                    if (category.name === 'ALL_RECIPES_SPECIAL') {
                      return (
                        <Link
                          key="ALL_RECIPES_SPECIAL"
                          to="/category/all"
                          onPointerEnter={() => { void prefetchCategoryRecipesPage(); }}
                          onFocus={() => { void prefetchCategoryRecipesPage(); }}
                          onTouchStart={() => { void prefetchCategoryRecipesPage(); }}
                          className="flex items-center gap-4 rounded-xl bg-card-light p-3 shadow-neo-light-convex dark:bg-card-dark dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all cursor-pointer group"
                        >
                          <div className="h-16 w-16 flex-shrink-0 rounded-lg flex items-center justify-center bg-gradient-to-br from-primary to-primary-dark shadow-inner text-white">
                            <span className="material-symbols-outlined text-3xl drop-shadow-sm">restaurant_menu</span>
                          </div>
                          <div className="flex-grow">
                            <p className="text-body font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">Alle Rezepte</p>
                            <p className="text-body-sm text-text-secondary-light dark:text-text-secondary-dark">
                              {category.count} Rezepte
                            </p>
                          </div>
                          <span className="material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark group-hover:translate-x-1 transition-transform">chevron_right</span>
                        </Link>
                      );
                    }

                    const cachedImage = categoryImageCache[category.name] || category.image;
                    const isLoading = categoryImageCache[category.name] === null;
                    const hasFailed = categoryImageCache[category.name] === false;

                    return (
                      <Link
                        key={category.name}
                        to={`/category/${encodeURIComponent(category.name)}`}
                        onPointerEnter={() => { void prefetchCategoryRecipesPage(); }}
                        onFocus={() => { void prefetchCategoryRecipesPage(); }}
                        onTouchStart={() => { void prefetchCategoryRecipesPage(); }}
                        className="flex items-center gap-4 rounded-xl bg-card-light p-3 shadow-neo-light-convex dark:bg-card-dark dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all cursor-pointer group"
                      >
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden relative rounded-lg">
                          {cachedImage ? (
                            <SafeImage
                              alt={`${category.name} icon`}
                              className="h-full w-full object-cover rounded-lg"
                              src={cachedImage}
                              autoRetry={true}
                            />
                          ) : isLoading ? (
                            <div className="h-full w-full bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center animate-pulse">
                              <span className="material-symbols-outlined text-gray-400 animate-spin">refresh</span>
                            </div>
                          ) : (
                            <div className="h-full w-full bg-gradient-to-br from-primary to-primary-dark rounded-lg flex items-center justify-center shadow-inner text-white">
                              <span className="material-symbols-outlined text-2xl drop-shadow-sm">image</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-grow">
                          <p className="text-body font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">
                            {category.name}
                            {hasFailed && <span className="text-red-500 ml-2 text-xs">(Bild konnte nicht geladen werden)</span>}
                          </p>
                          <p className="text-body-sm text-text-secondary-light dark:text-text-secondary-dark">{getRecipeCount(category.name)} Rezepte</p>
                        </div>
                        <span className="material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark flex-shrink-0 group-hover:translate-x-1 transition-transform">chevron_right</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ height: 'calc(var(--nav-height) + var(--safe-area-inset-bottom, 0px))' }} className="w-full shrink-0" />
      </div>
    </div>
  );
};

export default CategoriesPage;
