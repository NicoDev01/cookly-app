# Performance Optimization: Instant Page Navigation

## Overview
This document explains the "Instant Navigation" architecture implemented in Cookly. The goal was to eliminate loading spinners when switching between the main categories, category lists, and other top-level pages.

## The Problem: The "Blinking Spinner"
Previously, navigating between the `CategoriesPage` and the `CategoryRecipesPage` (or back) caused a brief flicker of a loading spinner. 

### Why did this happen?
1.  **Unmounting**: React Router's standard behavior is to unmount the old page and mount the new one.
2.  **Query States**: Convex's `useQuery` returns `undefined` during the initial fetch. Since the component was new, it had no data and triggered the component's internal loading state (the spinner).
3.  **Layout Logic**: The `TabsLayout` used conditional rendering (ternary operators). Navigating to a sub-page (like a category) caused the main tab container to unmount entirely.

## The Solution: Persistent Multi-Layer Rendering

### 1. Persistent DOM Nodes in `TabsLayout`
Instead of replacing the content of the layout, `TabsLayout` now maintains three persistent layers that are always present in the DOM:
*   **Tab Layer**: Contains all main tabs (Categories, Favorites, etc.).
*   **Category Cache Layer**: Contains instances of `CategoryRecipesPage` for every category visited in the session.
*   **Transient Layer**: For pages that should be remounted (like recipe details).

**Implementation Trick:**
We use `display: none` (or `display: contents`) instead of removing elements. This keeps the component's internal state and the browser's scroll position alive.

### 2. Stale-While-Revalidate Caching (`useCachedQuery`)
We use a custom hook `useCachedQuery` that wraps the standard Convex `useQuery`.
*   **Instant Result**: It immediately returns the last known data from an in-memory cache.
*   **Background Refresh**: It silently fetches the latest data from Convex and updates the UI once ready.
*   **No Spinner**: Because `data` is available immediately from the cache, the component skips the loading state entirely.

### 3. Prop-based Identity Preservation
Since pages stay alive in the background while the URL changes (e.g., you go from `/category/Italian` to `/tabs/categories`), we cannot rely solely on `useParams` for the category name. 
*   **Robustness**: We extended `CategoryRecipesPage` to accept a `category` prop. 
*   **Consistency**: The cached instance "remembers" its category via the prop, even if the address bar shows a different route.

## Developer Guidelines
When adding new top-level pages or lists:

1.  **Use `useCachedQuery`**: Instead of `useQuery` for lists, use the cached version to ensure navigation feels instant.
    ```tsx
    const { data: recipes } = useCachedQuery(api.recipes.list, { category }, `category-${category}`);
    ```
2.  **Avoid Conditional Mounts**: If a page should feel "native" and instant, ensure it is integrated into the persistent rendering pattern in `TabsLayout.tsx`.
3.  **Memoize Components**: Since multiple pages might exist in the DOM simultaneously (though only one is visible), ensure components are efficient and use `React.useMemo` for heavy calculations.

## Summary of Changes
*   **`TabsLayout.tsx`**: Switched from conditional rendering to persistent layers + category instance caching.
*   **`QueryCacheContext.tsx`**: Fixed a bug in the Convex data retrieval logic.
*   **`CategoryRecipesPage.tsx`**: Converted to `useCachedQuery` and added prop-based identity.

---









Zukünftige Optimierungen:
Sollte Cookly jemals Nutzer mit extrem vielen Daten haben, können wir diese Strategien anwenden, ohne das „Instant“-Gefühl zu verlieren:

Windowing / Virtualization (Wichtigster Schritt): Wir können in der 
CategoryRecipesPage
 eine Bibliothek wie react-virtuoso einbauen. Dann werden immer nur die ~10 Rezepte gerendert, die gerade im Sichtbereich wären. Der Rest des DOMs bleibt leer. Damit könnten wir 10.000 Rezepte im Hintergrund halten, ohne dass die Performance sinkt.
Cache-Limitierung: Wir könnten im 
TabsLayout
 nicht alle besuchten Kategorien halten, sondern nur die letzten 5 (Last Recently Used - LRU-Cache). Wenn die 6. geöffnet wird, wird die älteste aus dem DOM entfernt.
Abwägung: Aktuell ist die Usability (kein Spinner) wichtiger als die Performance bei 1000+ Rezepten, da die meisten Nutzer eher 50-200 Rezepte haben werden.
Fazit: Bei "hunderten" Rezepten wirst du wahrscheinlich noch nichts merken. Wenn es in die "tausende" geht, müssten wir Virtualisierung für die Listen nachrüsten. Soll ich dir zeigen, wie wir so eine Liste virtualisieren würden, oder reicht dir das erst mal als „Sicherheits-Check“?
