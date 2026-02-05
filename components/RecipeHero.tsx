import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Recipe } from '../types';
import ImageWithBlurhash from './ImageWithBlurhash';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';

import AddToPlanModal from './AddToPlanModal';

interface RecipeHeroProps {
  recipe: Recipe;
  onSidebarToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Reusable IconButton component with memo to prevent unnecessary re-renders
interface IconButtonProps {
  icon: string;
  onClick?: () => void;
  className?: string;
  isFilled?: boolean;
  animateBounce?: boolean;
  title?: string;
  ariaLabel?: string;
  ariaPressed?: boolean;
}

const IconButton = memo(({ icon, onClick, className = '', isFilled = false, animateBounce = false, title, ariaLabel, ariaPressed }: IconButtonProps) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center size-12 rounded-full bg-white/90 dark:bg-black/90 shadow-lg border border-gray-200/50 dark:border-gray-700/50 text-gray-900 dark:text-gray-100 active:scale-95 transition-transform ${className}`}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
    >
      <span
        className={`material-symbols-outlined !text-[24px] ${isFilled ? 'filled text-red-500' : ''}`}
        style={animateBounce ? {
          animation: 'heartBounce 0.4s ease-in-out'
        } : undefined}
      >
        {icon}
      </span>
      <style>{`
        @keyframes heartBounce {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.3); }
          50% { transform: scale(0.95); }
          75% { transform: scale(1.1); }
        }
      `}</style>
    </button>
  );
});

IconButton.displayName = 'IconButton';

const RecipeHero: React.FC<RecipeHeroProps> = ({ recipe, onSidebarToggle, onEdit, onDelete }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [heartBounce, setHeartBounce] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleFavorite = useMutation(api.recipes.toggleFavorite).withOptimisticUpdate((localStore, args) => {
    const { id } = args;
    const currentRecipe = localStore.getQuery(api.recipes.get, { id });
    if (currentRecipe) {
      localStore.setQuery(api.recipes.get, { id }, { ...currentRecipe, isFavorite: !currentRecipe.isFavorite });
    }
  });

  // Memoize favorite handler to prevent re-renders of IconButton
  const handleToggleFavorite = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Trigger heart bounce animation
    setHeartBounce(true);
    setTimeout(() => setHeartBounce(false), 400);

    try {
      await toggleFavorite({ id: recipe._id });
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('Fehler beim Umschalten der Favoriten:', error);
    }
  }, [recipe._id, toggleFavorite]);

  // Memoize plan modal handler
  const handleOpenPlanModal = useCallback(() => {
    setIsPlanModalOpen(true);
  }, []);

  // Memoize menu toggle handler
  const handleToggleMenu = useCallback(() => {
    setIsMenuOpen(prev => !prev);
  }, []);

  // Memoize edit handler
  const handleEdit = useCallback(() => {
    setIsMenuOpen(false);
    onEdit();
  }, [onEdit]);

  // Memoize delete handler
  const handleDeleteClick = useCallback(() => {
    setIsMenuOpen(false);
    setIsDeleteConfirmOpen(true);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative w-full h-[550px]">
      <ImageWithBlurhash
        className="w-full h-full object-cover"
        alt={recipe.imageAlt}
        src={recipe.image}
        blurhash={recipe.imageBlurhash}
        fetchPriority="high"
      />
      {/* Bottom fade only */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-background-light dark:from-background-dark to-transparent"></div>

      {/* Top Navigation Bar - Individual Icon Circles */}
      <div className="absolute top-0 left-0 right-0 z-30 pt-[var(--safe-area-inset-top)]">
        <div className="mx-4 mt-3 flex items-center justify-between">
          {/* Back Button */}
          <IconButton
            icon="arrow_back"
            onClick={onSidebarToggle}
            ariaLabel="Zurück"
            title="Zurück"
          />

          <div className="flex items-center gap-2">
            {/* Favorite Button */}
            <IconButton
              icon="favorite"
              onClick={handleToggleFavorite}
              isFilled={recipe.isFavorite}
              animateBounce={heartBounce}
              ariaLabel={recipe.isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              ariaPressed={recipe.isFavorite}
              title={recipe.isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            />

            {/* Add to Plan Button */}
            <IconButton
              icon="bookmark_add"
              onClick={handleOpenPlanModal}
              ariaLabel="Zum Wochenplan hinzufügen"
              title="Zum Wochenplan hinzufügen"
            />

            {/* Menu Button */}
            <div className="relative" ref={menuRef}>
              <IconButton
                icon="more_vert"
                onClick={handleToggleMenu}
                ariaLabel="Mehr Optionen"
                title="Mehr Optionen"
              />

              {isMenuOpen && (
                <div className="absolute right-0 lg:left-auto lg:right-0 top-full mt-2 w-52 max-w-[calc(100vw-32px)] bg-white dark:bg-black rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden origin-top-right animate-in fade-in zoom-in-95 duration-200 z-50">
                  <div className="p-1.5">
                    <button
                      onClick={handleEdit}
                      className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl flex items-center gap-3 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg opacity-70">edit</span>
                      Rezept bearbeiten
                    </button>

                    <div className="h-px bg-gray-100 dark:bg-gray-700/50 my-1 mx-2" />

                    <button
                      onClick={handleDeleteClick}
                      className="w-full text-left px-3 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl flex items-center gap-3 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg opacity-70">delete</span>
                      Rezept löschen
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AddToPlanModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        recipeId={recipe._id}
        recipeTitle={recipe.title}
        recipeImage={recipe.image}
      />

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsDeleteConfirmOpen(false)}
          />
          <div className="relative w-full max-w-sm bg-white dark:bg-[#1e3031] rounded-3xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="size-16 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl">delete_forever</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Rezept löschen?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">
                Soll das Rezept "{recipe.title}" wirklich unwiderruflich gelöscht werden?
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    setIsDeleteConfirmOpen(false);
                    onDelete();
                  }}
                  className="flex-1 py-3 rounded-xl font-bold bg-red-600 text-white shadow-lg shadow-red-600/20 active:scale-95 transition-all"
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default RecipeHero;
