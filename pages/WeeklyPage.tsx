import React, { useState, useMemo, useCallback, useRef, useTransition, useEffect } from 'react';
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Link } from 'react-router-dom';
import MealPlanModal from '../components/MealPlanModal';
import ImageWithBlurhash from '../components/ImageWithBlurhash';
import { Id } from "../convex/_generated/dataModel";
import { useModal } from '../contexts/ModalContext';
import { useAction } from 'convex/react';

const WeeklyPage: React.FC = () => {
  // State for Week Navigation
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  });

  // Transition for optimistic UI updates
  const [isPending, startTransition] = useTransition();

  // Store previous data to show during loading
  const prevWeeklyPlanRef = useRef<typeof weeklyPlan | null>(null);
  const [isWeekLoading, setIsWeekLoading] = useState(false);

  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>(() => {
    const saved = localStorage.getItem('weeklyViewMode');
    return (saved === 'daily' || saved === 'weekly') ? saved : 'weekly';
  });

  React.useEffect(() => {
    localStorage.setItem('weeklyViewMode', viewMode);
  }, [viewMode]);

  const { isAddMealModalOpen, openAddMealModal, closeAddMealModal, addMealModalOptions } = useModal();
  const [deletingMealIds, setDeletingMealIds] = useState<Set<Id<"weeklyMeals">>>(new Set());
  const [proxiedImages, setProxiedImages] = useState<Set<Id<"recipes">>>(new Set());

  const removeMeal = useMutation(api.weekly.removeMeal);
  const proxyImages = useAction(api.recipes.proxyExternalImages);

  // Helper to format date as YYYY-MM-DD for backend (Local Time)
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

  const startDateStr = formatDate(weekDays[0]);
  const endDateStr = formatDate(weekDays[6]);

  // Fetch Logic with loading state
  const weeklyPlan = useQuery(api.weekly.getWeek, {
    startDate: startDateStr,
    endDate: endDateStr
  });

  // Store previous data when new data arrives and update loading state
  React.useEffect(() => {
    if (weeklyPlan !== undefined) {
      prevWeeklyPlanRef.current = weeklyPlan;
      setIsWeekLoading(false);
    }
  }, [weeklyPlan]);

  // Use previous data during loading to prevent flickering
  const displayPlan = weeklyPlan ?? prevWeeklyPlanRef.current;
  const isInitialLoad = weeklyPlan === undefined && prevWeeklyPlanRef.current === null;

  // Auto-proxy Instagram images when plan loads
  useEffect(() => {
    if (!displayPlan) return;

    // Find recipes that need proxy (have sourceImageUrl but no imageStorageId)
    const recipesNeedingProxy = displayPlan
      .filter(item => item.recipe.sourceImageUrl && !item.recipe.imageStorageId)
      .filter(item => !proxiedImages.has(item.recipe._id))
      .map(item => item.recipe._id);

    if (recipesNeedingProxy.length > 0) {
      proxyImages({ recipeIds: recipesNeedingProxy })
        .then(result => {
          // Mark as proxied so we don't try again
          setProxiedImages(prev => new Set([...prev, ...recipesNeedingProxy]));
        })
        .catch(err => {
          console.error('[WeeklyPage] Proxy failed:', err);
        });
    }
  }, [displayPlan, proxiedImages, proxyImages]);

  // Derived state mapping: DateString -> Array(PlanItem)
  const planByDate = useMemo(() => {
    const map: Record<string, typeof displayPlan> = {};
    if (displayPlan) {
      displayPlan.forEach(item => {
        if (!map[item.date]) map[item.date] = [];
        map[item.date]!.push(item);
      });
    }
    return map;
  }, [displayPlan]);

  // Derived state for Weekly View (Aggregated)
  const allWeeklyMeals = useMemo(() => {
    if (!displayPlan) return [];
    return [...displayPlan].sort((a, b) => a.date.localeCompare(b.date));
  }, [displayPlan]);

  // Filter meals by scope for Daily View
  const dailyMeals = useMemo(() => {
    if (!displayPlan) return [];
    return displayPlan.filter(item => item.scope !== 'week');
  }, [displayPlan]);

  // Filter meals by scope for Weekly View
  const weeklyScopeMeals = useMemo(() => {
    if (!displayPlan) return [];
    return displayPlan.filter(item => item.scope === 'week');
  }, [displayPlan]);

  const handlePrevWeek = () => {
    startTransition(() => {
      setIsWeekLoading(true);
      const newStart = new Date(currentWeekStart);
      newStart.setDate(newStart.getDate() - 7);
      setCurrentWeekStart(newStart);
    });
  };

  const handleNextWeek = () => {
    startTransition(() => {
      setIsWeekLoading(true);
      const newStart = new Date(currentWeekStart);
      newStart.setDate(newStart.getDate() + 7);
      setCurrentWeekStart(newStart);
    });
  };

  const openAddModal = (dateStr: string, scope: 'day' | 'week' = 'day') => {
    openAddMealModal({ date: dateStr, scope });
  };

  const handleRemoveWithAnimation = async (mealId: Id<"weeklyMeals">) => {
    // Step 1: Add to deleting set to trigger exit animation
    setDeletingMealIds(prev => new Set(prev).add(mealId));

    // Step 2: Wait for animation to complete (400ms)
    await new Promise(resolve => setTimeout(resolve, 400));

    // Step 3: Remove from backend
    await removeMeal({ mealId });

    // Step 4: Remove from deleting set
    setDeletingMealIds(prev => {
      const next = new Set(prev);
      next.delete(mealId);
      return next;
    });
  };

  const toGermanDate = (d: Date) => {
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  };

  const getDayName = (d: Date) => {
    return d.toLocaleDateString('de-DE', { weekday: 'long' });
  };

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
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
  };

  const kw = getWeekNumber(weekDays[0]);

  const handleShare = async () => {
    if (!displayPlan || displayPlan.length === 0) return;

    const start = toGermanDate(weekDays[0]);
    const end = toGermanDate(weekDays[6]);
    let shareText = `ESSENSPLAN KW ${kw}\n${start} – ${end}\n\n`;

    if (viewMode === 'weekly') {
      // Show all meals in weekly view
      allWeeklyMeals.forEach(item => {
        shareText += `• ${item.recipe.title}\n`;
      });
    } else {
      // Daily view: Group by day, show weekly-scope items at the end
      weekDays.forEach(date => {
        const dateStr = formatDate(date);
        const meals = (planByDate[dateStr] || []).filter(item => item.scope !== 'week');

        if (meals.length > 0) {
          shareText += `*${getDayName(date)}*\n`;
          meals.forEach(item => {
            shareText += `• ${item.recipe.title}\n`;
          });
          shareText += `\n`;
        }
      });

      // Add weekly-scope meals at the end
      const extraMeals = weeklyScopeMeals;
      if (extraMeals.length > 0) {
        shareText += `*Weitere Gerichte*\n`;
        extraMeals.forEach(item => {
          shareText += `• ${item.recipe.title}\n`;
        });
      }
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Wochenplan ${start} - ${end}`,
          text: shareText.trim(),
        });
      } else {
        await navigator.clipboard.writeText(shareText.trim());
        alert('Plan wurde in die Zwischenablage kopiert!');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Fehler beim Teilen:', err);
      }
    }
  };


  return (
    <div className="page-enter relative flex w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark font-display">
      <div className="flex flex-col flex-1">

        {/* Header */}
        <div className="flex flex-col px-6 pt-6 pb-4 gap-4" style={{ paddingTop: 'max(1.5rem, var(--safe-area-inset-top))' }}>
          {/* Title Row */}
          <div className="flex items-center justify-between">
            <h1 className="text-[28px] font-bold text-text-primary-light dark:text-text-primary-dark tracking-tight">
              Wochenplan
            </h1>
          </div>

          {/* Actions Row (Share & Toggle) */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleShare}
              className="touch-btn flex items-center justify-center p-2 text-text-secondary-light dark:text-text-secondary-dark"
              title="Plan teilen"
            >
              <span className="material-symbols-outlined text-2xl">share</span>
            </button>

            <button
              onClick={() => setViewMode(prev => prev === 'daily' ? 'weekly' : 'daily')}
              className="touch-btn flex items-center justify-center p-2 text-text-secondary-light dark:text-text-secondary-dark"
              title={viewMode === 'daily' ? "Zur Wochenansicht wechseln" : "Zur Tagesansicht wechseln"}
            >
              <span className="material-symbols-outlined text-2xl">
                {viewMode === 'daily' ? 'calendar_view_week' : 'calendar_view_day'}
              </span>
            </button>
          </div>

          {/* KW Info + Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xl font-bold text-text-primary-light dark:text-text-primary-dark">
                KW {kw}{viewMode === 'weekly' && ' · Gesamte Woche'}
              </span>
              <span className="text-sm font-light text-text-secondary-light dark:text-text-secondary-dark">
                {toGermanDate(weekDays[0])} - {toGermanDate(weekDays[6])}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevWeek}
                disabled={isWeekLoading || isPending}
                className={`touch-btn p-2 text-text-primary-light dark:text-text-primary-dark transition-all duration-200 ${
                  isWeekLoading || isPending ? 'opacity-50 scale-95' : 'hover:scale-105'
                }`}
                title="Vorherige Woche"
              >
                <span className={`material-symbols-outlined text-2xl ${isWeekLoading || isPending ? 'animate-pulse' : ''}`}>
                  chevron_left
                </span>
              </button>
              <button
                type="button"
                onClick={handleNextWeek}
                disabled={isWeekLoading || isPending}
                className={`touch-btn p-2 text-text-primary-light dark:text-text-primary-dark transition-all duration-200 ${
                  isWeekLoading || isPending ? 'opacity-50 scale-95' : 'hover:scale-105'
                }`}
                title="Nächste Woche"
              >
                <span className={`material-symbols-outlined text-2xl ${isWeekLoading || isPending ? 'animate-pulse' : ''}`}>
                  chevron_right
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className={`flex flex-col gap-4 px-6 relative ${isWeekLoading ? 'opacity-60' : 'opacity-100'}`} style={{ transition: isWeekLoading ? 'opacity 200ms' : undefined }}>
          {/* Loading Overlay - only show when there's content */}
          {isWeekLoading && !isInitialLoad && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
          )}

          {/* EMPTY STATE - No meals planned */}
          {!isWeekLoading && allWeeklyMeals.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 pt-8 animate-in fade-in">
              {/* Icon */}
              <span className="material-symbols-outlined text-7xl sm:text-8xl text-primary mb-6">
                restaurant_menu
              </span>

              {/* Headline */}
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-4">
                Noch keine <span className="text-primary italic">Gerichte</span> geplant
              </h2>

              {/* Subtext */}
              <p className="text-body text-text-secondary-light dark:text-text-secondary-dark text-center max-w-sm mb-8">
                Plane deine Woche und erstelle einen Essensplan.
              </p>

              {/* CTA Button */}
              <button
                onClick={() => openAddModal(startDateStr, 'week')}
                className="w-fit flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-white font-semibold shadow-neo-light-convex hover:bg-primary-dark transition-colors touch-btn"
              >
                <span className="material-symbols-outlined">add_circle</span>
                Erstes Gericht hinzufügen
              </button>
            </div>
          )}

          {/* WEEKLY VIEW MODE - only show when there are meals */}
          {viewMode === 'weekly' && allWeeklyMeals.length > 0 && (
            <div className="flex flex-col gap-3">
              {allWeeklyMeals.map((item) => {
                const isDeleting = deletingMealIds.has(item.mealId);
                return (
                  <div
                    key={item.mealId}
                    className={`relative flex items-center gap-4 rounded-xl p-3 transition-all duration-200 ${
                      isDeleting
                        ? 'animate-out slide-out-to-right-4 fade-out duration-400 opacity-50 scale-95'
                        : 'bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave'
                    }`}
                  >
                    <Link to={`/recipe/${item.recipe._id}`} state={{ from: 'weekly' }} className="h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden relative">
                      {(item.recipe.image || item.recipe.sourceImageUrl) ? (
                        <ImageWithBlurhash
                          src={item.recipe.image || item.recipe.sourceImageUrl || ''}
                          blurhash={item.recipe.imageBlurhash}
                          alt={item.recipe.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <span className="material-symbols-outlined text-gray-400">restaurant</span>
                        </div>
                      )}
                    </Link>

                    <Link to={`/recipe/${item.recipe._id}`} state={{ from: 'weekly' }} className="flex-grow">
                      <h3 className="text-sm font-bold text-text-primary-light dark:text-text-primary-dark">{item.recipe.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-text-secondary-light dark:text-text-secondary-dark">
                        {item.scope !== 'week' && (
                          <>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium text-black dark:text-white shadow-neomorphism-pill dark:shadow-dark-neomorphism-pill bg-ingredient-2-bg">
                              {new Date(item.date).toLocaleDateString('de-DE', { weekday: 'short' })}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>{item.recipe.prepTimeMinutes} Min</span>
                      </div>
                    </Link>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveWithAnimation(item.mealId);
                      }}
                      disabled={deletingMealIds.has(item.mealId)}
                      className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Entfernen"
                    >
                      <span className="material-symbols-outlined text-xl">remove_circle</span>
                    </button>
                  </div>
                );
              })}

              <button
                onClick={() => openAddModal(startDateStr, 'week')}
                className={`self-start text-xs font-bold text-primary px-3 py-2 hover:bg-primary/5 rounded-lg transition-colors flex items-center gap-2 ${allWeeklyMeals.length > 0 ? 'mt-1' : ''}`}
              >
                <span className="material-symbols-outlined text-base">add_circle</span>
                Gericht zur Woche hinzufügen
              </button>
            </div>
          )}

          {/* DAILY VIEW MODE (Original) - only show when there are meals */}
          {viewMode === 'daily' && allWeeklyMeals.length > 0 && weekDays.map((date) => {
            const dateStr = formatDate(date);
            // Filter out week-scope items (they're shown separately in weekly view)
            const meals = (planByDate[dateStr] || []).filter(item => item.scope !== 'week');
            const isCurrentDay = isToday(date);

            return (
              <div
                key={dateStr}
                className={`flex flex-col gap-3 p-5 rounded-3xl transition-all ${isCurrentDay
                  ? 'bg-white dark:bg-gray-800 ring-1 ring-primary/20 shadow-xl shadow-primary/5'
                  : 'bg-card-light dark:bg-card-dark'
                  }`}
              >
                {/* Date Header */}
                <div className="flex flex-col">
                  <span className={`text-sm font-medium uppercase tracking-wider ${isCurrentDay ? 'text-primary' : 'text-text-secondary-light'}`}>
                    {getDayName(date)}
                  </span>
                  <span className="text-xl font-bold text-text-primary-light dark:text-text-primary-dark">
                    {date.getDate()}. {date.toLocaleDateString('de-DE', { month: 'long' })}
                  </span>
                </div>

                {/* Meals List */}
                <div className="flex flex-col gap-3 mt-2">
                  {meals.length > 0 && meals.map((item) => {
                    const isDeleting = deletingMealIds.has(item.mealId);
                    return (
                      <div
                        key={item.mealId}
                        className={`group relative flex items-center gap-4 bg-white dark:bg-black/20 p-2 pr-4 rounded-2xl shadow-sm border border-transparent hover:border-gray-100 dark:hover:border-gray-700 transition-all ${
                          isDeleting
                            ? 'animate-out slide-out-to-right-4 fade-out duration-400 opacity-50 scale-95'
                            : 'animate-in fade-in slide-in-from-bottom-2 duration-300'
                        }`}
                      >
                      {/* Recipe Image (Small) */}
                      <Link to={`/recipe/${item.recipe._id}`} state={{ from: 'weekly' }} className="block flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-100">
                        {(item.recipe.image || item.recipe.sourceImageUrl) ? (
                          <ImageWithBlurhash src={item.recipe.image || item.recipe.sourceImageUrl || ''} blurhash={item.recipe.imageBlurhash} alt={item.recipe.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <span className="material-symbols-outlined text-sm">restaurant</span>
                          </div>
                        )}
                      </Link>

                      {/* Info */}
                      <Link to={`/recipe/${item.recipe._id}`} state={{ from: 'weekly' }} className="flex-1 min-w-0 py-1">
                        <h4 className="font-bold text-md text-text-primary-light dark:text-text-primary-dark truncate pr-4 leading-tight mb-1">
                          {item.recipe.title}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-text-secondary-light">
                          <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md">{item.recipe.prepTimeMinutes} Min</span>
                          {item.recipe.isFavorite && <span className="material-symbols-outlined text-[10px] text-red-500 fill-current">favorite</span>}
                        </div>
                      </Link>

                      {/* Remove Button (Form Style) */}
                      <button
                        onClick={() => handleRemoveWithAnimation(item.mealId)}
                        disabled={deletingMealIds.has(item.mealId)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Entfernen"
                      >
                        <span className="material-symbols-outlined text-xl">remove_circle</span>
                      </button>
                    </div>
                    );
                  })}

                  {/* Add meal button - Always visible for consistency */}
                  <button
                    onClick={() => openAddModal(dateStr)}
                    className="self-start text-xs font-bold text-primary px-3 py-2 hover:bg-primary/5 rounded-lg transition-colors flex items-center gap-2 mt-1"
                  >
                    <span className="material-symbols-outlined text-base">add_circle</span>
                    Gericht hinzufügen
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ height: 'calc(var(--nav-height) + var(--safe-area-inset-bottom, 0px))' }} className="w-full shrink-0" />
      </div>

      {/* Add Meal Modal */}
      {isAddMealModalOpen && addMealModalOptions.date && (
        <MealPlanModal
          isOpen={isAddMealModalOpen}
          onClose={closeAddMealModal}
          mode="selectRecipes"
          date={addMealModalOptions.date}
          scope={addMealModalOptions.scope}
          weekStartDate={currentWeekStart}
          formattedDate={
            addMealModalOptions.scope === 'week'
              ? `Woche KW ${kw}`
              : new Date(addMealModalOptions.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
          }
        />
      )}
    </div>
  );
};

export default WeeklyPage;
