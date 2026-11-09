/** Logik des Favoriten-Tabs: Filter-Chips, Suche, Sortierung. Alles lokal auf den Vorschau-Daten. */

export type FavoritePreview = {
  _id: string;
  title: string;
  category: string;
  prepTimeMinutes: number;
  createdAt?: number;
  /** Wann das Herz gesetzt wurde; ältere Favoriten haben es nicht. */
  favoritedAt?: number;
};

export type FavoriteSort = 'recent' | 'name' | 'quick';

export const FAVORITE_SORTS: { key: FavoriteSort; label: string }[] = [
  { key: 'recent', label: 'Zuletzt gemerkt' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'quick', label: 'Schnellste zuerst' },
];

export const parseFavoriteSort = (value: string | null): FavoriteSort =>
  value === 'name' || value === 'quick' ? value : 'recent';

/** „Schnell“ wie in Rezept-Apps üblich: höchstens 30 Minuten. */
export const QUICK_MINUTES = 30;
export const QUICK_CHIP = 'quick';

export type FavoriteChip = { key: string; label: string; count: number };

/** Chips nur, wenn sie wirklich filtern: Kategorien nach Häufigkeit, „Schnell“ nur wenn nicht alle schnell sind. */
export const favoriteChips = (recipes: FavoritePreview[]): FavoriteChip[] => {
  const counts = new Map<string, number>();
  for (const r of recipes) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const quick = recipes.filter((r) => r.prepTimeMinutes > 0 && r.prepTimeMinutes <= QUICK_MINUTES).length;
  const chips: FavoriteChip[] = [];
  if (quick > 0 && quick < recipes.length) chips.push({ key: QUICK_CHIP, label: `Bis ${QUICK_MINUTES} Min`, count: quick });
  if (counts.size > 1) {
    const categories = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
    chips.push(...categories.map(([category, count]) => ({ key: `cat:${category}`, label: category, count })));
  }
  return chips;
};

const normalize = (text: string) => text.toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '');

export const filterFavorites = <T extends FavoritePreview>(recipes: T[], query: string, chip: string | null): T[] => {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return recipes.filter((r) => {
    if (chip === QUICK_CHIP && !(r.prepTimeMinutes > 0 && r.prepTimeMinutes <= QUICK_MINUTES)) return false;
    if (chip?.startsWith('cat:') && r.category !== chip.slice(4)) return false;
    if (terms.length === 0) return true;
    const haystack = normalize(`${r.title} ${r.category}`);
    return terms.every((term) => haystack.includes(term));
  });
};

const favoritedTime = (r: FavoritePreview) => r.favoritedAt ?? r.createdAt ?? 0;

export const sortFavorites = <T extends FavoritePreview>(recipes: T[], sort: FavoriteSort): T[] => {
  const byName = (a: T, b: T) => a.title.localeCompare(b.title, 'de');
  const sorted = [...recipes];
  if (sort === 'name') return sorted.sort(byName);
  if (sort === 'quick') {
    // Ohne Zeitangabe (0) ans Ende, damit „schnell“ nicht von unvollständigen Rezepten angeführt wird.
    const minutes = (r: T) => (r.prepTimeMinutes > 0 ? r.prepTimeMinutes : Number.POSITIVE_INFINITY);
    return sorted.sort((a, b) => minutes(a) - minutes(b) || byName(a, b));
  }
  return sorted.sort((a, b) => favoritedTime(b) - favoritedTime(a) || byName(a, b));
};

export const favoriteMeta = (r: FavoritePreview) =>
  [r.prepTimeMinutes > 0 ? `${r.prepTimeMinutes} Min` : null, r.category].filter(Boolean).join(' · ');

export type FavoriteLayout = 'grid' | 'list';

/** Alte Werte der früheren Ansicht: „compact“ war die Liste, „large“ die großen Bilder (jetzt Raster). */
export const parseFavoriteLayout = (value: string | null): FavoriteLayout =>
  value === 'list' || value === 'compact' ? 'list' : 'grid';

export type PlannedMeal = { recipeId: string; date: string; scope: 'day' | 'week' };

/**
 * Hinweis auf der Karte, wenn ein Favorit diese Woche schon eingeplant ist: gegen doppeltes Planen.
 * Vergangene Tage zählen nicht, der nächste Termin gewinnt; „Diese Woche“ für Einträge ohne festen Tag.
 */
export const plannedLabels = (meals: PlannedMeal[], today: string, dayLabel: (date: string) => string) => {
  const next = new Map<string, PlannedMeal>();
  for (const meal of meals) {
    if (meal.scope === 'day' && meal.date < today) continue;
    const current = next.get(meal.recipeId);
    const sortKey = (m: PlannedMeal) => (m.scope === 'week' ? '~' : m.date);
    if (!current || sortKey(meal) < sortKey(current)) next.set(meal.recipeId, meal);
  }
  const labels: Record<string, string> = {};
  for (const [recipeId, meal] of next) {
    labels[recipeId] = meal.scope === 'week' ? 'Diese Woche' : meal.date === today ? 'Heute' : dayLabel(meal.date);
  }
  return labels;
};

/** Stabiler Farbindex (0–9) für Rezepte ohne Foto, damit das Raster nicht einfarbig wirkt. */
export const placeholderColorIndex = (title: string) => {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 10;
};
