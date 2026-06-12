export const FAVORITES_VIEW_MODES = {
  large: "large",
  compact: "compact",
} as const;

export type FavoritesViewMode =
  (typeof FAVORITES_VIEW_MODES)[keyof typeof FAVORITES_VIEW_MODES];

export function parseFavoritesViewMode(value: string | null): FavoritesViewMode {
  return value === FAVORITES_VIEW_MODES.compact
    ? FAVORITES_VIEW_MODES.compact
    : FAVORITES_VIEW_MODES.large;
}

export function getNextFavoritesViewMode(
  current: FavoritesViewMode
): FavoritesViewMode {
  return current === FAVORITES_VIEW_MODES.large
    ? FAVORITES_VIEW_MODES.compact
    : FAVORITES_VIEW_MODES.large;
}
