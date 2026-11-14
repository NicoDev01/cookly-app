import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Id } from '../../convex/_generated/dataModel';
import ImageWithBlurhash from '../ImageWithBlurhash';
import BottomSheet from '../weekly/BottomSheet';
import { iconButton, inputClass, inputIcon, inputShell, sheetButton } from '../ui/tabStyles';
import { ONB_IMG } from '../onboarding/onboardingData';
import { useLongPress } from '../../hooks/useLongPress';
import { useHaptic } from '../../hooks/useHaptic';
import { prefetchRecipePage } from '../../prefetch';
import { useNotification } from '../../contexts/NotificationContext';
import {
  FAVORITE_SORTS,
  favoriteChips,
  favoriteMeta,
  filterFavorites,
  parseFavoriteLayout,
  parseFavoriteSort,
  placeholderColorIndex,
  sortFavorites,
  type FavoriteLayout,
  type FavoritePreview,
  type FavoriteSort,
} from '../../utils/favoritesView';

export type FavoriteRecipe = FavoritePreview & {
  _id: Id<'recipes'>;
  image?: string;
  thumbnail?: string;
  imageAlt?: string;
  imageBlurhash?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageAspectRatio?: number;
  sourceImageUrl?: string;
  isFavorite: boolean;
};

type Props = {
  /** undefined = lädt noch */
  recipes: FavoriteRecipe[] | undefined;
  onUnfavorite: (recipe: FavoriteRecipe) => void;
  onPlan: (recipe: FavoriteRecipe) => void;
  /** true = hinzugefügt, false = stand schon auf der Liste */
  /** `null`: nicht ausgeführt (offline), die Seite hat schon Bescheid gegeben. */
  onAddToShopping: (recipe: FavoriteRecipe) => Promise<boolean | null>;
  /** Präfix für gemerkte Ansicht und Sortierung, damit das Labor die App nicht umstellt. */
  storageKey: string;
  emptyPath: string;
  /** Rezept-ID → „Heute“, „Do“, „Diese Woche“: schon eingeplant. */
  plannedLabels?: Record<string, string>;
  /** Globale Suche (über Zutaten), wenn in den Favoriten nichts passt. */
  searchAllPath: string;
};

/** Symbol für den Wechsel in die jeweils andere Ansicht. */
const SWITCH_ICON: Record<FavoriteLayout, string> = { grid: 'view_agenda', list: 'view_module' };
/** Suche erst ab einer Menge, bei der Scrollen länger dauert als Tippen. */
const SEARCH_FROM = 6;

/** Pastellfarben wie die Zutaten-Pills; ausgeschrieben, damit Tailwind die Klassen findet. */
const PLACEHOLDER_COLORS = [
  'bg-ingredient-1-bg text-ingredient-1',
  'bg-ingredient-2-bg text-ingredient-2',
  'bg-ingredient-3-bg text-ingredient-3',
  'bg-ingredient-4-bg text-ingredient-4',
  'bg-ingredient-5-bg text-ingredient-5',
  'bg-ingredient-6-bg text-ingredient-6',
  'bg-ingredient-7-bg text-ingredient-7',
  'bg-ingredient-8-bg text-ingredient-8',
  'bg-ingredient-9-bg text-ingredient-9',
  'bg-ingredient-10-bg text-ingredient-10',
];

const readSetting = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeSetting = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Privater Modus o. Ä.: Ansicht ist nur Komfort.
  }
};

const RecipeImage: React.FC<{ recipe: FavoriteRecipe; className: string }> = ({ recipe, className }) => {
  const src = recipe.image || recipe.sourceImageUrl;
  return src ? (
    <ImageWithBlurhash src={src} thumbnail={recipe.thumbnail} blurhash={recipe.imageBlurhash} alt={recipe.imageAlt || recipe.title} className={className} />
  ) : (
    <div className={`${className} flex items-center justify-center ${PLACEHOLDER_COLORS[placeholderColorIndex(recipe.title)]}`}>
      <span className="material-symbols-outlined text-3xl">restaurant</span>
    </div>
  );
};

const linkState = (recipe: FavoriteRecipe, ids: Id<'recipes'>[], index: number) => ({
  nav: { ids, index },
  from: 'favorites',
  heroPreview: {
    id: recipe._id,
    image: recipe.image,
    imageBlurhash: recipe.imageBlurhash,
    imageWidth: recipe.imageWidth,
    imageHeight: recipe.imageHeight,
    imageAspectRatio: recipe.imageAspectRatio,
    imageAlt: recipe.imageAlt || recipe.title,
    title: recipe.title,
    isFavorite: true,
  },
});

/** Tippen öffnet das Rezept, Halten oder ⋮ das Menü. */
const RecipeCard: React.FC<{
  recipe: FavoriteRecipe;
  layout: FavoriteLayout;
  state: ReturnType<typeof linkState>;
  planned?: string;
  onMenu: () => void;
}> = ({ recipe, layout, state, planned, onMenu }) => {
  const haptic = useHaptic();
  const { handlers, consumeLongPress } = useLongPress(() => {
    void haptic.impact('light');
    onMenu();
  });
  const link = {
    to: `/recipe/${recipe._id}`,
    state,
    ...handlers,
    onClick: (e: React.MouseEvent) => {
      if (consumeLongPress()) e.preventDefault();
    },
    style: { WebkitTouchCallout: 'none' } as React.CSSProperties,
  };
  const meta = favoriteMeta(recipe);
  const title = <p className="line-clamp-2 text-[15px] font-bold leading-snug text-text-primary-light dark:text-text-primary-dark">{recipe.title}</p>;
  const metaLine = meta && <p className="mt-0.5 truncate text-sm text-text-secondary-light dark:text-text-secondary-dark">{meta}</p>;
  const plannedPill = planned && (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-text-primary-light shadow-sm dark:bg-black/60 dark:text-white">
      <span className="material-symbols-outlined text-[14px]">calendar_month</span>
      {planned}
    </span>
  );

  if (layout === 'grid') {
    return (
      <div className="relative">
        <Link {...link} className="block select-none transition-transform active:scale-[0.98]">
          <div className="relative">
            <RecipeImage recipe={recipe} className="aspect-[4/3] w-full rounded-2xl shadow-neo-light-convex dark:shadow-neo-dark-convex" />
            {plannedPill && <span className="absolute bottom-2 left-2">{plannedPill}</span>}
          </div>
          <div className="mt-2 px-0.5">
            {title}
            {metaLine}
          </div>
        </Link>
        <button
          type="button"
          onClick={onMenu}
          aria-label={`Aktionen für ${recipe.title}`}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm active:scale-90"
        >
          <span className="material-symbols-outlined text-[20px]">more_vert</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-2xl bg-card-light p-2.5 shadow-neo-light-convex dark:bg-card-dark dark:shadow-neo-dark-convex">
      <Link {...link} className="flex min-w-0 flex-1 select-none items-center gap-3">
        <RecipeImage recipe={recipe} className="h-16 w-16 flex-shrink-0 rounded-xl" />
        <div className="min-w-0">
          {title}
          {metaLine}
          {plannedPill && <div className="mt-1">{plannedPill}</div>}
        </div>
      </Link>
      <button
        type="button"
        onClick={onMenu}
        aria-label={`Aktionen für ${recipe.title}`}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-text-secondary-light active:bg-black/5 dark:text-text-secondary-dark dark:active:bg-white/10"
      >
        <span className="material-symbols-outlined text-[22px]">more_vert</span>
      </button>
    </div>
  );
};

const FavoritesView: React.FC<Props> = ({
  recipes,
  onUnfavorite,
  onPlan,
  onAddToShopping,
  storageKey,
  emptyPath,
  plannedLabels,
  searchAllPath,
}) => {
  const { showToast } = useNotification();
  const [layout, setLayout] = useState<FavoriteLayout>(() => parseFavoriteLayout(readSetting(`${storageKey}.layout`)));
  const [sort, setSort] = useState<FavoriteSort>(() => parseFavoriteSort(readSetting(`${storageKey}.sort`)));
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<string | null>(null);
  const [menu, setMenu] = useState<FavoriteRecipe | 'sort' | null>(null);

  const list = useMemo(() => recipes ?? [], [recipes]);
  // Rezeptseite schon laden, solange man noch auswählt: Das Öffnen wirkt dann sofort.
  const hasRecipes = list.length > 0;
  useEffect(() => {
    if (hasRecipes) void prefetchRecipePage();
  }, [hasRecipes]);
  const chips = useMemo(() => favoriteChips(list), [list]);
  // Verschwindet die Kategorie (letztes Rezept entfernt), gilt wieder „Alle“.
  const activeChip = chips.some((c) => c.key === chip) ? chip : null;
  const visible = useMemo(() => sortFavorites(filterFavorites(list, query, activeChip), sort), [list, query, activeChip, sort]);
  const visibleIds = useMemo(() => visible.map((r) => r._id), [visible]);
  const isFiltered = query.trim() !== '' || activeChip !== null;

  const changeLayout = (next: FavoriteLayout) => {
    setLayout(next);
    writeSetting(`${storageKey}.layout`, next);
  };
  const changeSort = (next: FavoriteSort) => {
    setSort(next);
    writeSetting(`${storageKey}.sort`, next);
    setMenu(null);
  };
  const resetFilters = () => {
    setQuery('');
    setChip(null);
  };

  const unfavorite = (recipe: FavoriteRecipe) => {
    setMenu(null);
    onUnfavorite(recipe);
  };
  const plan = (recipe: FavoriteRecipe) => {
    setMenu(null);
    onPlan(recipe);
  };
  const addToShopping = async (recipe: FavoriteRecipe) => {
    setMenu(null);
    try {
      const added = await onAddToShopping(recipe);
      if (added === null) return;
      showToast(added ? 'Zutaten stehen auf der Einkaufsliste' : 'Steht schon auf der Einkaufsliste', added ? 'success' : 'info');
    } catch {
      showToast('Das hat nicht geklappt. Bitte versuch es noch einmal.', 'error');
    }
  };

  const recipeMenu = menu && menu !== 'sort' ? menu : null;
  const countLabel = list.length === 1 ? '1 Rezept' : `${list.length} Rezepte`;

  return (
    <div className="page-enter relative flex w-full flex-col overflow-x-hidden bg-background-light font-display dark:bg-background-dark">
      <header className="px-6 pb-2" style={{ paddingTop: 'calc(var(--safe-area-inset-top, 0px) + 0.75rem)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-headline text-text-primary-light dark:text-text-primary-dark">Favoriten</h1>
            {list.length > 0 && (
              <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
                {isFiltered ? `${visible.length} von ${countLabel}` : countLabel}
              </p>
            )}
          </div>
          {list.length > 1 && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMenu('sort')} aria-label="Sortieren" className={`${iconButton} relative`}>
                <span className="material-symbols-outlined text-[20px]">sort</span>
                {/* Punkt = nicht die Standard-Reihenfolge, damit eine geänderte Sortierung nicht überrascht. */}
                {sort !== 'recent' && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />}
              </button>
              <button
                type="button"
                onClick={() => changeLayout(layout === 'grid' ? 'list' : 'grid')}
                aria-label={layout === 'grid' ? 'Als Liste anzeigen' : 'Als Raster anzeigen'}
                className={iconButton}
              >
                <span className="material-symbols-outlined text-[20px]">{SWITCH_ICON[layout]}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Kein Skeleton: Die Daten sind meist sofort da, ein kurzes Platzhalter-Raster wirkte nur wie Flackern. */}
      {recipes === undefined ? null : list.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center animate-in fade-in">
          <img src={ONB_IMG.nice} alt="" className="h-40 w-auto object-contain" />
          <h2 className="mt-4 text-xl font-bold text-text-primary-light dark:text-text-primary-dark">Noch keine Favoriten</h2>
          <p className="mt-2 max-w-xs text-[15px] text-text-secondary-light dark:text-text-secondary-dark">
            Tippe bei einem Rezept auf das Herz. Deine Lieblingsrezepte findest du dann hier.
          </p>
          <Link to={emptyPath} className="mt-6 rounded-full bg-primary px-5 py-3 text-[15px] font-semibold text-white active:scale-95">
            Rezepte ansehen
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pt-2">
          {list.length >= SEARCH_FROM && (
            <div className="px-6">
              <div className={`${inputShell} pl-4`}>
                <span className={inputIcon}>search</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && query) {
                      e.preventDefault();
                      setQuery('');
                    }
                  }}
                  enterKeyHint="search"
                  placeholder="In Favoriten suchen"
                  aria-label="In Favoriten suchen"
                  className={inputClass}
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Suche löschen" className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary-light active:bg-black/5 dark:text-text-secondary-dark">
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {chips.length > 0 && (
            // Innenabstand oben/unten, sonst schneidet der Scrollbereich die Schatten der Chips ab.
            <div className="-my-2 flex gap-2 overflow-x-auto px-6 py-2 scrollbar-hide" role="group" aria-label="Filtern">
              {[{ key: null, label: 'Alle' }, ...chips].map((c) => {
                const active = activeChip === c.key;
                return (
                  <button
                    key={c.key ?? 'all'}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setChip(active ? null : c.key)}
                    className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition active:scale-95 ${
                      active
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-card-light text-text-primary-light shadow-neo-light-convex dark:bg-card-dark dark:text-text-primary-dark dark:shadow-neo-dark-convex'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="flex flex-col items-center px-8 pt-10 text-center">
              <p className="text-[15px] font-semibold text-text-primary-light dark:text-text-primary-dark">Keine passenden Favoriten</p>
              {query.trim() && (
                // Die Favoriten-Suche kennt nur Titel und Kategorie; die globale Suche findet auch Zutaten.
                <Link
                  to={{ pathname: searchAllPath, search: `?q=${encodeURIComponent(query.trim())}` }}
                  className="mt-4 rounded-full bg-primary px-5 py-2.5 text-[15px] font-semibold text-white active:scale-95"
                >
                  In allen Rezepten suchen
                </Link>
              )}
              <button type="button" onClick={resetFilters} className="mt-2 rounded-full px-4 py-2 text-[15px] font-semibold text-primary active:bg-primary/10">
                Filter zurücksetzen
              </button>
            </div>
          ) : (
            <div className={`px-6 pt-1 ${layout === 'grid' ? 'grid grid-cols-2 gap-x-4 gap-y-5' : 'flex flex-col gap-3'}`}>
              {visible.map((recipe, index) => (
                <RecipeCard
                  key={recipe._id}
                  recipe={recipe}
                  layout={layout}
                  state={linkState(recipe, visibleIds, index)}
                  planned={plannedLabels?.[recipe._id]}
                  onMenu={() => setMenu(recipe)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation + Platz für den runden „+ Rezept“-Knopf und die schwebende Leiste darüber. */}
      <div style={{ height: 'calc(var(--nav-height) + var(--safe-area-inset-bottom, 0px) + 8rem)' }} className="w-full shrink-0" />


      {menu === 'sort' && (
        <BottomSheet title="Sortieren" onClose={() => setMenu(null)}>
          <div className="flex flex-col gap-1 pb-2">
            {FAVORITE_SORTS.map((option) => (
              <button key={option.key} type="button" onClick={() => changeSort(option.key)} className={sheetButton} aria-pressed={sort === option.key}>
                {option.label}
                {sort === option.key && <span className="material-symbols-outlined ml-auto text-[22px] text-primary">check</span>}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {recipeMenu && (
        <BottomSheet title={recipeMenu.title} subtitle={favoriteMeta(recipeMenu) || undefined} onClose={() => setMenu(null)}>
          <div className="flex flex-col gap-1 pb-2">
            <button type="button" onClick={() => plan(recipeMenu)} className={sheetButton}>
              <span className="material-symbols-outlined text-[22px]">calendar_month</span>
              Im Wochenplan einplanen
            </button>
            <button type="button" onClick={() => void addToShopping(recipeMenu)} className={sheetButton}>
              <span className="material-symbols-outlined text-[22px]">shopping_cart</span>
              Zutaten auf die Einkaufsliste
            </button>
            <button type="button" onClick={() => unfavorite(recipeMenu)} className={`${sheetButton} !text-red-500 active:!bg-red-500/10`}>
              <span className="material-symbols-outlined filled text-[22px]">favorite</span>
              Aus Favoriten entfernen
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};

export default FavoritesView;
