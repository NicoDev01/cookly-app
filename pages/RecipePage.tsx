import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import useEmblaCarousel from 'embla-carousel-react';
import RecipeHero from '../components/RecipeHero';
import RecipeMeta from '../components/RecipeMeta';
import Ingredients from '../components/Ingredients';
import Instructions from '../components/Instructions';
import { Recipe } from '../types';

const AddRecipeModal = React.lazy(() => import('../components/AddRecipeModal'));

type RecipeNavState = {
  nav?: {
    ids: string[];
    index?: number;
  };
  flash?: {
    message?: string;
    tone?: 'success' | 'info' | 'error';
  };
  from?: 'favorites' | 'weekly';
};

const RecipeSlideContent = React.memo(({ 
  recipeId, 
  onEdit, 
  onDelete, 
  onSidebarToggle,
}: { 
  recipeId: Id<"recipes">;
  onEdit: (recipe: Recipe) => void;
  onDelete: (id: Id<"recipes">) => void;
  onSidebarToggle: () => void;
}) => {
  const recipe = useQuery(api.recipes.get, { id: recipeId });

  if (!recipe) {
    return (
      <div className="relative flex h-auto min-h-screen w-full flex-col bg-white">
        <div className="flex-1 flex items-center justify-center pb-24">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <main className="relative z-10 flex-1 min-h-full bg-white">
      <RecipeHero
        recipe={recipe}
        onSidebarToggle={onSidebarToggle}
        onEdit={() => onEdit(recipe)}
        onDelete={() => onDelete(recipe._id)}
      />
      <div className="relative z-20 -mt-6 mb-6 mx-2 p-6 rounded-3xl glassmorphism bg-white/60 backdrop-blur-xl shadow-neo-light-convex border border-gray-100 md:mx-auto md:max-w-2xl lg:max-w-3xl">
        <RecipeMeta recipe={recipe} />
        <Ingredients ingredients={recipe.ingredients} />
        <Instructions instructions={recipe.instructions} ingredients={recipe.ingredients} />
      </div>
    </main>
  );
});

const RecipeSlide = ({ 
  id, 
  index,
  isVisible, 
  onEdit, 
  onDelete, 
  onSidebarToggle,
}: { 
  id: Id<"recipes">;
  index: number;
  isVisible: boolean;
  onEdit: (recipe: Recipe) => void;
  onDelete: (id: Id<"recipes">) => void;
  onSidebarToggle: () => void;
}) => {
  if (!isVisible) {
    return <div className="h-full w-full" />; 
  }
  return (
    <RecipeSlideContent 
      recipeId={id} 
      onEdit={onEdit} 
      onDelete={onDelete} 
      onSidebarToggle={onSidebarToggle} 
    />
  );
};

const RecipeSlideWrapper = ({ 
  children, 
  isActive 
}: { 
  children: React.ReactNode; 
  isActive: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && ref.current) {
      // Reset immediately
      ref.current.scrollTop = 0;
      
      // And ensure it stays there after any layout shifts
      requestAnimationFrame(() => {
        if (ref.current) ref.current.scrollTop = 0;
      });
    }
  }, [isActive]);

  return (
    <div 
      ref={ref} 
      className={`flex-none w-full h-full min-w-0 relative overflow-y-auto overflow-x-hidden scrollbar-hide overscroll-y-contain ${isActive ? '[content-visibility:visible]' : '[content-visibility:auto]'}`}
    >
      {children}
    </div>
  );
};

const RecipePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const handleBack = useBackNavigation();
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashTone, setFlashTone] = useState<'success' | 'info' | 'error'>('info');

  // Reset window scroll position when entering the page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Determine context (e.g. coming from Favorites or Weekly)
  const isFavoritesMode = (location.state as RecipeNavState)?.from === 'favorites';
  const isWeeklyMode = (location.state as RecipeNavState)?.from === 'weekly';

  useEffect(() => {
    const state = location.state as RecipeNavState | null;
    const msg = state?.flash?.message;
    const tone = state?.flash?.tone;
    if (!msg || typeof msg !== 'string') return;

    setFlashMessage(msg);
    if (tone === 'success' || tone === 'info' || tone === 'error') {
      setFlashTone(tone);
    } else {
      setFlashTone('info');
    }
    const t = window.setTimeout(() => setFlashMessage(null), 2800);

    // Clear state so refresh/back doesn't re-show.
    navigate(location.pathname, { replace: true, state: { nav: state?.nav, from: state?.from } satisfies RecipeNavState });
    return () => window.clearTimeout(t);
  }, [location.pathname, location.state, navigate]);

  // Fetch recipes based on context
  // If in favorites mode, fetch only favorites. Otherwise fetch all.
  const allRecipeIds = useQuery(api.recipes.listIds);
  
  const favoriteRecipeIds = useQuery(api.recipes.getFavoritesIds);

  const weeklyRecipeIds = useQuery(api.recipes.getWeeklyListIds);

  // Determine the list of IDs to show
  const recipeIds = useMemo(() => {
    const navState = location.state as RecipeNavState | null;
    if (navState?.nav?.ids) return navState.nav.ids;

    if (isFavoritesMode) return favoriteRecipeIds;
    if (isWeeklyMode) return weeklyRecipeIds;
    return allRecipeIds;
  }, [location.state, isFavoritesMode, isWeeklyMode, favoriteRecipeIds, weeklyRecipeIds, allRecipeIds]);

  // Find the index of the currently requested recipe
  const initialIndex = useMemo(() => {
    if (!id || !recipeIds || recipeIds.length === 0) return 0;
    const idx = recipeIds.findIndex((rId) => rId === id);
    return idx >= 0 ? idx : 0;
  }, [id, recipeIds]);

  // Initialize Embla Carousel
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    startIndex: initialIndex,
    align: 'center',
    containScroll: 'trimSnaps',
  });

  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Ensure we jump to the correct slide when data loads
  useEffect(() => {
    if (emblaApi && recipeIds && id) {
      const idx = recipeIds.findIndex((rId) => rId === id);
      if (idx >= 0 && emblaApi.selectedScrollSnap() !== idx) {
        emblaApi.scrollTo(idx, true);
        setCurrentIndex(idx);
      }
    }
  }, [emblaApi, recipeIds, id]);

  // Sync URL when user swipes (Silent Update)
  useEffect(() => {
    if (!emblaApi || !recipeIds || recipeIds.length === 0) return;

    const onSelect = () => {
      const index = emblaApi.selectedScrollSnap();
      setCurrentIndex(index);
      const recipeId = recipeIds[index];
      
      // Only update URL if we are on a different recipe than the URL says.
      // We use replaceState to avoid cluttering the history stack with every swipe.
      if (recipeId && recipeId !== id) {
        // Preserve the state (e.g. from: 'favorites') when updating the URL
        window.history.replaceState(
          { 
            ...window.history.state, 
            usr: { 
              ...window.history.state?.usr, 
              from: isFavoritesMode ? 'favorites' : (isWeeklyMode ? 'weekly' : undefined) 
            } 
          }, 
          '', 
          `/recipe/${recipeId}`
        );
      }
    };

    emblaApi.on('select', onSelect);
    // Initialize currentIndex
    onSelect();
    
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, recipeIds, id, isFavoritesMode, isWeeklyMode]);

  // Handle external navigation (e.g. clicking a link to another recipe)
  // This ensures the carousel jumps to the correct slide if the ID changes via props/router.
  useEffect(() => {
    if (!emblaApi) return;
    const currentSnap = emblaApi.selectedScrollSnap();
    if (currentSnap !== initialIndex) {
      emblaApi.scrollTo(initialIndex);
    }
  }, [initialIndex, emblaApi]);

  const deleteRecipe = useMutation(api.recipes.deleteRecipe);

  const handleDelete = useCallback(async (recipeId: Id<"recipes">) => {
    await deleteRecipe({ id: recipeId });
    handleBack();
  }, [deleteRecipe, handleBack]);

  const handleEdit = useCallback((recipe: Recipe) => {
    setEditingRecipe(recipe);
    setIsAddModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
    setEditingRecipe(null);
  }, []);

  const handleSidebarToggle = useCallback(() => handleBack(), [handleBack]);

  if (!recipeIds) {
    return (
      <div className="relative flex h-auto min-h-screen w-full flex-col bg-background-light dark:bg-background-dark">
        <div className="flex-1 flex items-center justify-center pb-24">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (recipeIds.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark flex-col">
        <p className="text-text-secondary-light dark:text-text-secondary-dark mb-4">Keine Rezepte gefunden.</p>
        <button onClick={() => navigate('/')} className="text-primary font-bold">Zurück zur Übersicht</button>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] w-full flex-col group/design-root overflow-hidden bg-white font-display">

      {flashMessage && (
        <div className="fixed top-4 left-4 right-4 z-50">
          <div
            className={
              flashTone === 'success'
                ? 'mx-auto max-w-2xl rounded-xl bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-100 px-4 py-3 text-sm'
                : flashTone === 'error'
                  ? 'mx-auto max-w-2xl rounded-xl bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100 px-4 py-3 text-sm'
                  : 'mx-auto max-w-2xl rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex px-4 py-3 text-sm text-text-primary-light dark:text-text-primary-dark'
            }
          >
            {flashMessage}
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0">
        <div
          ref={emblaRef}
          className="overflow-hidden h-full cursor-grab active:cursor-grabbing"
        >
          <div className="flex h-full touch-pan-y touch-pinch-zoom">
            {recipeIds.map((rId, index) => (
              <RecipeSlideWrapper key={rId} isActive={index === currentIndex}>
                <RecipeSlide 
                  id={rId}
                  index={index}
                  isVisible={Math.abs(currentIndex - index) <= 1}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onSidebarToggle={handleSidebarToggle}
                />
              </RecipeSlideWrapper>
            ))}
          </div>
        </div>
      </div>

      {isAddModalOpen && (
        <Suspense fallback={null}>
          <AddRecipeModal
            isOpen={isAddModalOpen}
            onClose={handleCloseModal}
            initialData={editingRecipe}
          />
        </Suspense>
      )}
    </div>
  );
};

export default RecipePage;
