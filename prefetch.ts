// Centralized chunk prefetch helpers.
// Calling these functions triggers Vite to download the corresponding route chunk.

export const prefetchCategoriesPage = () => import('./pages/CategoriesPage');
export const prefetchCategoryRecipesPage = () => import('./pages/CategoryRecipesPage');
export const prefetchRecipePage = () => import('./pages/RecipePage');
export const prefetchFavoritesPage = () => import('./pages/FavoritesPage');
export const prefetchWeeklyPage = () => import('./pages/WeeklyPage');
export const prefetchShoppingPage = () => import('./pages/ShoppingPage');
export const prefetchProfilePage = () => import('./pages/ProfilePage');

export const prefetchAddRecipeModal = () => import('./components/AddRecipeModal');

// Image prefetching for instant visual feedback
let prefetchedImages = new Set<string>();

export const prefetchRecipeImages = async (imageUrls: string[]) => {
  // Prefetch first 20 images, skip already prefetched
  const toPrefetch = imageUrls.slice(0, 20).filter(url => url && !prefetchedImages.has(url));

  if (toPrefetch.length === 0) return;

  // Use requestIdleCallback for non-blocking prefetch
  const prefetchImages = () => {
    toPrefetch.forEach(url => {
      if (url && !prefetchedImages.has(url)) {
        const img = new Image();
        img.src = url;
        prefetchedImages.add(url);
      }
    });
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => prefetchImages(), { timeout: 2000 });
  } else {
    // Fallback: setTimeout for browsers without requestIdleCallback
    setTimeout(prefetchImages, 100);
  }
};

export const clearPrefetchedImages = () => {
  prefetchedImages.clear();
};
