import React, { useState } from 'react';
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Link, useSearchParams } from 'react-router-dom';
import SafeImage from '../components/SafeImage';
import EmptyState from '../components/EmptyState';
import { prefetchCategoryRecipesPage, prefetchRecipePage } from '../prefetch';
import { useDebounce } from 'use-debounce';
import { useModal } from '../contexts/ModalContext';
import { getCategoryPreviewImages } from '../utils/categoryPreviewImages';
import { inputClass, inputIcon, inputShell } from '../components/ui/tabStyles';


interface CategoryImageCache {
  [categoryName: string]: string | null | false; // null = loading, string = URL, false = failed (don't retry)
}

interface CategoryListItem {
  name: string;
  count: number;
  image?: string;
  recipeImages?: string[];
}

type SearchResult = FunctionReturnType<typeof api.recipes.searchPreviews>;

/** Suchbegriff aus der URL; alte Links mit ?ingredients=a,b werden zur Suche "a b". */
const readSearchParam = (params: URLSearchParams) =>
  params.get("q") ?? (params.get("ingredients") ?? "").split(",").filter(Boolean).join(" ");

const formatRecipeCount = (count: number) => `${count} ${count === 1 ? 'Rezept' : 'Rezepte'}`;

const CategoryPreviewImage: React.FC<{
  images: string[];
  isLoading: boolean;
  categoryName: string;
}> = ({ images, isLoading, categoryName }) => {
  if (images.length === 0) {
    return isLoading ? (
      <div className="h-full w-full bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center animate-pulse">
        <span className="material-symbols-outlined text-gray-400 animate-spin">refresh</span>
      </div>
    ) : (
      <div className="h-full w-full bg-gradient-to-br from-primary to-primary-dark rounded-lg flex items-center justify-center shadow-inner text-white">
        <span className="material-symbols-outlined text-2xl drop-shadow-sm">image</span>
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <SafeImage
        alt={`${categoryName} icon`}
        className="h-full w-full object-cover rounded-lg"
        src={images[0]}
        autoRetry={true}
      />
    );
  }

  const cells = Array.from({ length: 4 }, (_, index) => images[index]);

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5 bg-card-light dark:bg-card-dark">
      {cells.map((image, index) => (
        image ? (
          <SafeImage
            key={`${image}-${index}`}
            alt={`${categoryName} Rezept ${index + 1}`}
            className="h-full w-full rounded-[4px]"
            src={image}
            autoRetry={true}
          />
        ) : (
          <div key={`empty-${index}`} className="h-full w-full rounded-[4px] bg-gray-100 dark:bg-gray-800" />
        )
      ))}
    </div>
  );
};

const CategoriesPage: React.FC = () => {
  const { openAddModal } = useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  // Suchbegriff steht in der URL (?q=), damit er nach dem Zurück aus einem Rezept noch da ist.
  const [searchQuery, setSearchQuery] = React.useState(() => readSearchParam(searchParams));
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  // PERFORMANCE (QW-5): Debounce, damit nicht jeder Tastendruck eine neue Query startet
  const [debouncedSearch] = useDebounce(searchQuery.trim(), 300);
  const [categoryImageCache, setCategoryImageCache] = useState<CategoryImageCache>({});
  const [isVisible, setIsVisible] = useState(false); // For fade-in animation

  // Trigger fade-in animation on mount
  React.useEffect(() => {
    setIsVisible(true);
  }, []);


  // PERFORMANCE (QW-2): NICHT für Kategorien verwenden!
  // Kategorien ändern sich (Bilder werden nachträglich hinzugefügt)
  // useCachedQuery würde alte Daten ohne Bilder zurückgeben
  const categoriesWithStats = useQuery(api.categories.getCategoriesWithStats, {});
  const categoriesLoading = categoriesWithStats === undefined;

  // Ergebnisliste sofort weg, wenn das Feld leer ist; sonst Treffer zum entprellten Begriff.
  const isFiltering = searchQuery.trim().length > 0;

  // URL von außen geändert (Tab erneut angetippt, alter ?ingredients=-Link): Feld übernimmt sie.
  // Eigene Schreibvorgänge erkennt man daran, dass sie dem entprellten Begriff entsprechen.
  const urlQuery = readSearchParam(searchParams);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== debouncedSearch) setSearchQuery(urlQuery);
  }

  // Entprellten Begriff in die URL schreiben (replace: kein Verlaufseintrag pro Wort). Alte ?ingredients= fällt weg.
  React.useEffect(() => {
    setSearchParams(prev => {
      if ((prev.get("q") ?? "") === debouncedSearch && !prev.has("ingredients")) return prev;
      const next = new URLSearchParams(prev);
      if (debouncedSearch) next.set("q", debouncedSearch);
      else next.delete("q");
      next.delete("ingredients");
      return next;
    }, { replace: true });
  }, [debouncedSearch, setSearchParams]);

  // Titel und Zutaten werden auf dem Server durchsucht; zurück kommen nur Vorschauen.
  const searchResult = useQuery(
    api.recipes.searchPreviews,
    isFiltering && debouncedSearch ? { query: debouncedSearch } : "skip"
  );
  // Letzte Treffer stehen lassen, bis die neuen da sind: kein Flackern und kein „nichts gefunden“ beim Tippen.
  // Feld geleert: alte Treffer vergessen, sonst blitzen sie bei der nächsten Suche kurz auf.
  const [shownResult, setShownResult] = useState<SearchResult | undefined>(undefined);
  if (!isFiltering && shownResult !== undefined) setShownResult(undefined);
  else if (isFiltering && searchResult !== undefined && searchResult !== shownResult) setShownResult(searchResult);
  const isSearchPending = searchResult === undefined || debouncedSearch !== searchQuery.trim();

  // Für Screenreader: Ergebnis der Suche ansagen, sobald es feststeht.
  const searchStatus = !isFiltering || isSearchPending || !shownResult
    ? ""
    : shownResult.total > 0
      ? `${formatRecipeCount(shownResult.total)} gefunden${shownResult.approximate ? ", ähnliche Treffer" : ""}`
      : "Keine Treffer";

  /** Suche ohne ein Wort, das in keinem Rezept vorkommt. */
  const searchWithout = (term: string) => {
    if (!shownResult) return;
    setSearchQuery(shownResult.query.split(/[\s,;]+/).filter((word) => word && word !== term).join(" "));
  };

  const stats = categoriesWithStats;
  const hasCategoriesInDb = (stats?.length ?? 0) > 0;
  // Nur ohne Kategorie-Statistik: Kategorien aus den Rezept-Vorschauen ableiten.
  const allRecipes = useQuery(
    api.recipes.listPreviews,
    !categoriesLoading && !hasCategoriesInDb ? {} : "skip"
  );

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

  const categoriesList = React.useMemo<CategoryListItem[]>(() => {
    let list: CategoryListItem[] = [];
    // stats ist jetzt ein Array von Kategorie-Objekten
    if (stats && Array.isArray(stats)) {
      list = stats.map(({ name, count, image, recipeImages }) => ({
        name,
        count,
        image: image ?? undefined,
        recipeImages: recipeImages ?? undefined,
      }));
    } else if (allRecipes) {
      const uniqueCats = Array.from(new Set(allRecipes.map(r => r.category))).sort();
      list = uniqueCats.map(name => ({
        name,
        count: 0,
        image: undefined as string | undefined,
        recipeImages: allRecipes
          .filter(recipe => recipe.category === name)
          .map(recipe => recipe.image)
          .filter((image): image is string => typeof image === "string" && image.length > 0)
          .slice(0, 4),
      }));
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

  const filteredRecipes = React.useMemo(() => shownResult?.recipes ?? [], [shownResult]);
  const filteredIds = React.useMemo(() => filteredRecipes.map((r) => r._id), [filteredRecipes]);

  const clearSearch = () => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  };

  // Sync Cache mit DB-Bildern wenn stats sich ändert.
  // Überschreibt gecachete URLs wenn die DB ein neues Bild liefert,
  // damit gelöschte/umbenannte Kategorien keine alten Bilder zeigen.
  React.useEffect(() => {
    if (stats && Array.isArray(stats)) {
      setCategoryImageCache(prev => {
        const updated = { ...prev };
        const activeCategories = new Set(stats.map(c => c.name));

        // Veraltete Cache-Einträge für nicht mehr existierende Kategorien entfernen
        Object.keys(updated).forEach(name => {
          if (!activeCategories.has(name)) {
            delete updated[name];
          }
        });

        stats.forEach(category => {
          if (category.image) {
            // Immer aktualisieren wenn DB ein Bild hat (außer wenn gerade lädt = null)
            if (prev[category.name] !== null) {
              updated[category.name] = category.image;
            }
          }
        });

        return updated;
      });
    }
  }, [stats]);

  return (
    <div className={`page-enter relative flex w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark font-display transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex flex-col flex-1">

        {!isEmptyState && (
          <div className="flex items-center px-6 pb-2" style={{ paddingTop: 'calc(var(--safe-area-inset-top, 0px) + 0.75rem)' }}>
            <img
              src="/green-logo.webp"
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
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  searchInputRef.current?.blur(); // Tastatur schließen, Treffer sind schon da
                }}
                className={`${inputShell} pl-4`}
              >
                <label htmlFor="global-search" className="sr-only">Rezepte oder Zutaten suchen</label>
                <span className={inputIcon}>search</span>
                <input
                  ref={searchInputRef}
                  id="global-search"
                  name="search"
                  className={inputClass}
                  placeholder="Rezept oder Zutat suchen"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape' && searchQuery) { e.preventDefault(); setSearchQuery(""); } }}
                  maxLength={100}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="search"
                  enterKeyHint="search"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Suche löschen"
                    className="touch-btn flex h-full items-center justify-center px-1.5 text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
                      <span className="material-symbols-outlined !text-base">close</span>
                    </span>
                  </button>
                )}
              </form>
            </div>

            {/* Page Title */}
            <div className="flex items-baseline justify-between gap-3 px-6 pt-2 pb-2">
              <h1 className="text-text-primary-light dark:text-text-primary-dark text-[26px] font-bold">
                {isFiltering ? 'Suchergebnisse' : 'Kategorien'}
              </h1>
              {isFiltering && shownResult && shownResult.total > 0 && (
                <span className={`text-body-sm text-text-secondary-light dark:text-text-secondary-dark transition-opacity ${isSearchPending ? 'opacity-50' : ''}`}>
                  {formatRecipeCount(shownResult.total)}
                </span>
              )}
            </div>
            <p className="sr-only" role="status" aria-live="polite">{searchStatus}</p>
          </>
        )}

        <div className="pb-4">
          {isFiltering ? (
            !shownResult ? (
              <div className="grid grid-cols-1 gap-4 p-6 pb-4" aria-busy="true">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 rounded-xl bg-card-light dark:bg-card-dark p-3 animate-pulse">
                    <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-gray-200 dark:bg-gray-700" />
                    <div className="flex-grow space-y-2">
                      <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
                      <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredRecipes.length === 0 ? (
              <div className={`px-8 py-12 text-center text-text-secondary-light dark:text-text-secondary-dark transition-opacity ${isSearchPending ? 'opacity-50' : ''}`}>
                <span className="material-symbols-outlined text-5xl mb-3 block opacity-50">search_off</span>
                {shownResult.unmatchedTerms.length > 0 ? (
                  <>
                    {/* Ein bestimmtes Wort kommt nirgends vor: genau das sagen und anbieten, es wegzulassen. */}
                    <p className="font-medium text-text-primary-light dark:text-text-primary-dark">
                      {shownResult.unmatchedTerms.map((term) => `„${term}“`).join(' und ')}{' '}
                      {shownResult.unmatchedTerms.length === 1 ? 'kommt' : 'kommen'} in keinem deiner Rezepte vor.
                    </p>
                    <p className="mt-1 text-body-sm">Gesucht wird in Titeln, Kategorien und Zutaten.</p>
                    {shownResult.unmatchedTerms.length < shownResult.query.split(/[\s,;]+/).filter(Boolean).length && (
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {shownResult.unmatchedTerms.map((term) => (
                          <button
                            key={term}
                            type="button"
                            onClick={() => searchWithout(term)}
                            className="touch-btn rounded-full bg-primary/15 px-4 py-2 text-sm font-semibold text-text-primary-light dark:text-text-primary-dark active:scale-95 transition"
                          >
                            Ohne „{term}“ suchen
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Jedes Wort gibt es, nur nicht zusammen in einem Rezept. */}
                    <p className="font-medium text-text-primary-light dark:text-text-primary-dark">Kein Rezept enthält alles davon.</p>
                    <p className="mt-1 text-body-sm">Jedes Wort muss im selben Rezept vorkommen. Lass eins weg, um mehr zu finden.</p>
                  </>
                )}
              </div>
            ) : (
              <div className={`grid grid-cols-1 gap-4 p-6 pb-4 transition-opacity ${isSearchPending ? 'opacity-60' : ''}`}>
                {shownResult.approximate && (
                  <p className="-mt-2 text-body-sm text-text-secondary-light dark:text-text-secondary-dark">
                    Nichts genau zu „{shownResult.query}“ gefunden. Meintest du eines davon?
                  </p>
                )}
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
                          src={recipe.thumbnail ?? recipe.image}
                          alt={recipe.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white shadow-inner">
                          <span className="material-symbols-outlined text-2xl drop-shadow-sm">restaurant</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-grow">
                      <p className="text-body font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">{recipe.title}</p>
                      <div className="flex min-w-0 gap-2 text-body-sm text-text-secondary-light dark:text-text-secondary-dark">
                        <span className="shrink-0">{recipe.category}</span>
                        <span className="shrink-0">•</span>
                        {/* Über eine Zutat gefunden: zeigen, welche. Sonst wie gewohnt die Zeit. */}
                        {recipe.matchedIngredients.length > 0 ? (
                          <span className="truncate">
                            {recipe.matchedIngredients.length === 1 ? 'Zutat' : 'Zutaten'}: {recipe.matchedIngredients.join(', ')}
                          </span>
                        ) : (
                          <span>{recipe.prepTimeMinutes} Min</span>
                        )}
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark flex-shrink-0 group-hover:translate-x-1 transition-transform">chevron_right</span>
                  </Link>
                ))}
                {shownResult.total > filteredRecipes.length && (
                  <p className="text-center text-body-sm text-text-secondary-light dark:text-text-secondary-dark">
                    {filteredRecipes.length} von {shownResult.total} angezeigt. Ein weiteres Wort grenzt die Suche ein.
                  </p>
                )}
              </div>
            )
          ) : (
            <>


              {/* Loading State - Skeleton Categories (professional loading experience) */}
              {categoriesLoading && (!stats || stats.length === 0) && (
                <div className="grid grid-cols-1 gap-4 p-6 pb-4 pt-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 rounded-xl bg-card-light dark:bg-card-dark p-3 animate-pulse">
                      <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-gray-200 dark:bg-gray-700" />
                      <div className="flex-grow space-y-2">
                        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                      </div>
                      <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    </div>
                  ))}
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
                          className="flex min-h-[5.5rem] items-center gap-4 rounded-xl bg-card-light px-4 py-4 shadow-neo-light-convex dark:bg-card-dark dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all cursor-pointer group"
                        >
                          <div className="flex-grow">
                            <p className="text-title font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">Alle Rezepte</p>
                            <p className="text-body-sm text-text-secondary-light dark:text-text-secondary-dark">
                              {formatRecipeCount(category.count)}
                            </p>
                          </div>
                          <span className="material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark group-hover:translate-x-1 transition-transform">chevron_right</span>
                        </Link>
                      );
                    }

                    const cachedImage = categoryImageCache[category.name] || category.image;
                    const isLoading = categoryImageCache[category.name] === null;
                    const hasFailed = categoryImageCache[category.name] === false;
                    const previewImages = getCategoryPreviewImages(category.recipeImages, cachedImage);

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
                          <CategoryPreviewImage
                            images={previewImages}
                            isLoading={isLoading}
                            categoryName={category.name}
                          />
                        </div>
                        <div className="flex-grow">
                          <p className="text-body font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">
                            {category.name}
                            {hasFailed && <span className="text-red-500 ml-2 text-xs">(Bild konnte nicht geladen werden)</span>}
                          </p>
                          <p className="text-body-sm text-text-secondary-light dark:text-text-secondary-dark">{formatRecipeCount(getRecipeCount(category.name))}</p>
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
