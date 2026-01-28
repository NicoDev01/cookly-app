import React, { useState, useRef, useEffect } from 'react';
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

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

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
  };

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
      {/* Top fade - stronger and longer */}
      <div className="absolute top-0 left-0 right-0 h-[80px] bg-gradient-to-b from-background via-background/70 to-transparent dark:from-background-dark dark:via-background-dark/70 dark:to-transparent"></div>
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-background-light dark:from-background-dark to-transparent"></div>

      {/* Top Navigation Bar - Meta Card Style */}
      <div className="absolute top-0 left-0 right-0 z-30 pt-[var(--safe-area-inset-top)]">
        <div className="mx-4 mt-2">
          {/* Fade overlay around the nav card */}
          <div className="absolute -inset-4 bg-gradient-to-b from-white/80 via-white/40 to-transparent dark:from-black/80 dark:via-black/40 dark:to-transparent pointer-events-none -z-10 rounded-3xl"></div>
          <div className="bg-white dark:bg-black rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center justify-between px-3 py-2.5">
              <button
                onClick={onSidebarToggle}
                className="flex items-center justify-center p-1.5 -ml-1.5 text-gray-900 dark:text-gray-100 active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined !text-[28px]">arrow_back</span>
              </button>

              <div className="flex items-center gap-0.5">
                {/* Favorite Button */}
                <button
                  onClick={handleToggleFavorite}
                  className="touch-btn flex items-center justify-center p-1.5 text-gray-900 dark:text-gray-100 active:scale-95 transition-transform"
                  title={recipe.isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                >
                  <span className={`material-symbols-outlined !text-[28px] ${recipe.isFavorite ? 'filled text-red-500' : ''} ${heartBounce ? 'heart-bounce' : ''}`}>
                    favorite
                  </span>
                </button>

                {/* Add to Plan Button */}
                <button
                  onClick={() => setIsPlanModalOpen(true)}
                  className="flex items-center justify-center p-1.5 text-gray-900 dark:text-gray-100 active:scale-95 transition-transform"
                  title="Zum Wochenplan hinzufügen"
                >
                  <span className="material-symbols-outlined !text-[28px]">
                    bookmark_add
                  </span>
                </button>

                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex items-center justify-center p-1.5 text-gray-900 dark:text-gray-100 active:scale-95 transition-transform"
                  >
                    <span className="material-symbols-outlined !text-[28px]">more_vert</span>
                  </button>

                  {isMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-black rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden origin-top-right animate-in fade-in zoom-in-95 duration-200 z-50">
                      <div className="p-1.5">
                        <button
                          onClick={() => {
                            setIsMenuOpen(false);
                            onEdit();
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl flex items-center gap-3 transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg opacity-70">edit</span>
                          Rezept bearbeiten
                        </button>

                        <div className="h-px bg-gray-100 dark:bg-gray-700/50 my-1 mx-2" />

                        <button
                          onClick={() => {
                            setIsMenuOpen(false);
                            setIsDeleteConfirmOpen(true);
                          }}
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
