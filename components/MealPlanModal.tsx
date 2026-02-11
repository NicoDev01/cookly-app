import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import ImageWithBlurhash from './ImageWithBlurhash';

// Modal modes: selectDay (from recipe detail) or selectRecipes (from weekly page)
type ModalMode = 'selectDay' | 'selectRecipes';

interface MealPlanModalProps {
  isOpen: boolean;
  onClose: () => void;

  // Mode-specific props
  mode: ModalMode;

  // For selectDay mode (from RecipeHero)
  recipeId?: Id<"recipes">;
  recipeTitle?: string;
  recipeImage?: string;

  // For selectRecipes mode (from WeeklyPage)
  date?: string;
  scope?: 'day' | 'week';
  formattedDate?: string;
  weekStartDate?: Date; // NEW: Pass week start from parent
}

const MealPlanModal: React.FC<MealPlanModalProps> = ({
  isOpen,
  onClose,
  mode,
  recipeId,
  recipeTitle,
  recipeImage,
  date,
  scope,
  formattedDate,
  weekStartDate: weekStartDateProp, // Use parent's week start if provided
}) => {
  // Mutations
  const addMeal = useMutation(api.weekly.addMeal);
  const addMeals = useMutation(api.weekly.addMeals);

  // State for Week Navigation - use prop if provided, otherwise default to current week
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    if (weekStartDateProp) {
      return weekStartDateProp;
    }
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  });

  // Sync internal state when prop changes (for week navigation from parent)
  useEffect(() => {
    if (weekStartDateProp) {
      setCurrentWeekStart(weekStartDateProp);
    }
  }, [weekStartDateProp]);

  // State for selectRecipes mode
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipes, setSelectedRecipes] = useState<Set<Id<"recipes">>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Queries for selectRecipes mode
  const allRecipes = useQuery(api.recipes.list, { search: searchQuery || undefined });
  const favoriteRecipes = useQuery(api.recipes.getFavorites, {});

  // Reset state when modal closes or mode changes
  useEffect(() => {
    if (isOpen) {
      if (mode === 'selectRecipes') {
        setSelectedRecipes(new Set());
        setSearchQuery('');
      }
    }
  }, [isOpen, mode]);

  // Helper to format date as YYYY-MM-DD for backend
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Generate the 7 days of the current view
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentWeekStart]);

  const handlePrevWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const handleNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  // selectDay mode: Add recipe to specific day
  const handleSelectDay = async (selectedDate: Date) => {
    if (!recipeId) return;
    await addMeal({
      recipeId,
      date: formatDate(selectedDate),
      scope: scope ?? 'day',
    });
    onClose();
  };

  // selectRecipes mode: Toggle selection
  const displayedRecipes = useMemo(() => {
    if (mode !== 'selectRecipes') return [];
    if (activeTab === 'favorites') {
      if (!favoriteRecipes) return undefined;
      if (!searchQuery) return favoriteRecipes;
      const lowerQ = searchQuery.toLowerCase();
      return favoriteRecipes.filter(r => r.title.toLowerCase().includes(lowerQ));
    } else {
      return allRecipes;
    }
  }, [mode, activeTab, allRecipes, favoriteRecipes, searchQuery]);

  const toggleSelection = (id: Id<"recipes">) => {
    setSelectedRecipes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (selectedRecipes.size === 0 || isSubmitting || !date) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await addMeals({
        recipeIds: Array.from(selectedRecipes),
        date,
        scope,
      });
      onClose();
    } catch (err) {
      console.error('Error adding meals:', err);
      setError('Fehler beim Speichern der Mahlzeiten.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearSelection = () => {
    setSelectedRecipes(new Set());
  };

  // Prevent scrolling background when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const getDayName = (d: Date) => d.toLocaleDateString('de-DE', { weekday: 'short' });
  const getFormattedDate = (d: Date) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const isToday = (d: Date) => {
    const today = new Date();
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-auto">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-up Panel */}
      <div className="relative w-full h-[92vh] bg-background-light dark:bg-background-dark rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up pb-safe-offset">

        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4 p-4 pb-3 border-b border-gray-100 dark:border-gray-800 bg-card-light/50 dark:bg-card-dark/50 backdrop-blur-md z-10">

          {/* Top Row: Close + Title */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="touch-btn p-2 -ml-2 rounded-full text-text-primary-light dark:text-text-primary-dark"
            >
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>

            {mode === 'selectRecipes' ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark font-display uppercase tracking-wider">
                  {formattedDate}
                </span>
                {selectedRecipes.size > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="touch-btn text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full text-text-secondary-light dark:text-text-secondary-dark uppercase font-bold tracking-tighter"
                  >
                    Leeren
                  </button>
                )}
              </div>
            ) : (
              <div className="flex-1 text-center px-4">
                <h3 className="text-lg font-bold text-text-primary-light dark:text-text-primary-dark line-clamp-2 leading-tight">
                  {recipeTitle}
                </h3>
              </div>
            )}

            {/* Spacer for layout balance */}
            {mode === 'selectRecipes' ? <div className="w-10" /> : null}
          </div>

          {/* Week Navigation */}
          <div className="flex items-center justify-between px-2">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="p-1 text-text-secondary-light dark:text-text-secondary-dark hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-2xl">chevron_left</span>
            </button>
            <span className="font-medium text-text-primary-light dark:text-text-primary-dark text-sm">
              KW {getWeekNumber(weekDays[0])} · {getFormattedDate(weekDays[0])} - {getFormattedDate(weekDays[6])}
            </span>
            <button
              type="button"
              onClick={handleNextWeek}
              className="p-1 text-text-secondary-light dark:text-text-secondary-dark hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-2xl">chevron_right</span>
            </button>
          </div>

          {/* Search + Tabs (only for selectRecipes mode) */}
          {mode === 'selectRecipes' && (
            <>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined">search</span>
                <input
                  type="text"
                  placeholder="Rezept suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-12 pl-10 pr-4 rounded-xl bg-white dark:bg-gray-900 border-none outline-none ring-1 ring-gray-200 dark:ring-gray-800 focus:ring-2 focus:ring-primary text-text-primary-light dark:text-text-primary-dark text-base"
                />
              </div>

              <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                <button
                  type="button"
                  className={`touch-scale flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'all' ? 'bg-white dark:bg-gray-700 shadow-sm text-text-primary-light dark:text-text-primary-dark' : 'text-text-secondary-light dark:text-text-secondary-dark'}`}
                  onClick={() => setActiveTab('all')}
                >
                  Alle Rezepte
                </button>
                <button
                  type="button"
                  className={`touch-scale flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'favorites' ? 'bg-white dark:bg-gray-700 shadow-sm text-text-primary-light dark:text-text-primary-dark' : 'text-text-secondary-light dark:text-text-secondary-dark'}`}
                  onClick={() => setActiveTab('favorites')}
                >
                  Favoriten
                </button>
              </div>

              {error && (
                <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg text-center animate-in fade-in slide-in-from-top-1">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Content Area */}
        {mode === 'selectDay' ? (
          // selectDay mode: Show days list
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-2 pb-safe-offset">
              {weekDays.map(date => {
                const current = isToday(date);
                return (
                  <button
                    type="button"
                    key={date.toISOString()}
                    onClick={() => handleSelectDay(date)}
                    className={`flex items-center justify-between p-4 rounded-xl transition-all ${current
                      ? 'bg-primary/10 border border-primary/20 shadow-sm'
                      : 'bg-card-light dark:bg-card-dark hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${current
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-text-secondary-light dark:text-text-secondary-dark'
                        }`}>
                        {getDayName(date).substring(0, 2)}
                      </div>
                      <span className={`text-base font-medium ${current ? 'text-primary' : 'text-text-primary-light dark:text-text-primary-dark'}`}>
                        {getFormattedDate(date)}
                      </span>
                    </div>
                    <span className={`material-symbols-outlined ${current ? 'text-primary' : 'text-gray-300 dark:text-gray-600'}`}>
                      add_circle
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          // selectRecipes mode: Show recipes list
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            <div className="grid grid-cols-1 gap-3 pb-20">
              {displayedRecipes === undefined ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : displayedRecipes.length === 0 ? (
                <div className="text-center py-10 text-text-secondary-light dark:text-text-secondary-dark">
                  Keine Rezepte gefunden.
                </div>
              ) : (
                displayedRecipes.map(recipe => {
                  const isSelected = selectedRecipes.has(recipe._id);
                  return (
                    <div
                      key={recipe._id}
                      onClick={() => toggleSelection(recipe._id)}
                      className={`flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer ${isSelected
                        ? 'bg-primary/10 border-primary shadow-sm'
                        : 'bg-card-light dark:bg-card-dark border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                    >
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                        {(recipe.image || recipe.sourceImageUrl) ? (
                          <ImageWithBlurhash
                            src={recipe.image || recipe.sourceImageUrl || ''}
                            blurhash={recipe.imageBlurhash}
                            alt={recipe.title}
                            className="w-full h-full object-cover"
                            forceLoad={true}
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <span className="material-symbols-outlined text-gray-400">restaurant</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className={`text-sm font-bold truncate ${isSelected ? 'text-primary' : 'text-text-primary-light dark:text-text-primary-dark'}`}>
                          {recipe.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary-light dark:text-text-secondary-dark">
                          <span>{recipe.prepTimeMinutes} Min</span>
                          <span>•</span>
                          <span>{recipe.difficulty}</span>
                        </div>
                      </div>

                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'
                        }`}>
                        {isSelected && <span className="material-symbols-outlined text-white text-sm">check</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer Action (only for selectRecipes mode) */}
        {mode === 'selectRecipes' && (
          <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 border-t border-gray-100 dark:border-gray-800 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md">
            <button
              type="button"
              onClick={handleAddSelected}
              disabled={selectedRecipes.size === 0 || isSubmitting}
              className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-lg shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Wird gespeichert...</span>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined">add_circle</span>
                  {selectedRecipes.size > 0 ? `${selectedRecipes.size} Hinzufügen` : 'Rezepte auswählen'}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .pb-safe-offset {
          padding-bottom: env(safe-area-inset-bottom, 20px);
        }
      `}</style>
    </div>,
    document.body
  );
};

export default MealPlanModal;
