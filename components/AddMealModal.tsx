import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import ImageWithBlurhash from './ImageWithBlurhash';

interface AddMealModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: string; // YYYY-MM-DD
    scope?: 'day' | 'week'; // day = specific day, week = for the whole week
    formattedDate: string; // e.g. "Montag, 5. Jan"
}

const AddMealModal: React.FC<AddMealModalProps> = ({ isOpen, onClose, date, scope = 'day', formattedDate }) => {
    const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRecipes, setSelectedRecipes] = useState<Set<Id<"recipes">>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const addMeals = useMutation(api.weekly.addMeals);

    // Queries
    const allRecipes = useQuery(api.recipes.list, { search: searchQuery || undefined });
    const favoriteRecipes = useQuery(api.recipes.getFavorites, {});

    // Reset selection when modal closes or opens
    useEffect(() => {
        if (isOpen) {
            setSelectedRecipes(new Set());
            setSearchQuery('');
        }
    }, [isOpen]);

    const displayedRecipes = useMemo(() => {
        if (activeTab === 'favorites') {
            if (!favoriteRecipes) return undefined;
            if (!searchQuery) return favoriteRecipes;
            // Client-side filtering for favorites if search exists (since backend getFavorites doesn't take search arg yet)
            const lowerQ = searchQuery.toLowerCase();
            return favoriteRecipes.filter(r => r.title.toLowerCase().includes(lowerQ));
        } else {
            return allRecipes;
        }
    }, [activeTab, allRecipes, favoriteRecipes, searchQuery]);

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

    const handleAdd = async () => {
        if (selectedRecipes.size === 0 || isSubmitting) return;
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

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-auto">
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
                <div className="flex flex-col gap-4 px-4 pb-3 border-b border-gray-100 dark:border-gray-800 bg-card-light/50 dark:bg-card-dark/50 backdrop-blur-md z-10">

                    <div className="flex items-center justify-between">
                        <button
                            onClick={onClose}
                            className="touch-btn p-2 -ml-2 rounded-full text-text-primary-light dark:text-text-primary-dark"
                        >
                            <span className="material-symbols-outlined text-2xl">close</span>
                        </button>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark font-display uppercase tracking-wider">
                                {formattedDate}
                            </span>
                            {selectedRecipes.size > 0 && (
                                <button
                                    onClick={clearSelection}
                                    className="touch-btn text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full text-text-secondary-light dark:text-text-secondary-dark uppercase font-bold tracking-tighter"
                                >
                                    Leeren
                                </button>
                            )}
                        </div>
                    </div>

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
                            className={`touch-scale flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'all' ? 'bg-white dark:bg-gray-700 shadow-sm text-text-primary-light dark:text-text-primary-dark' : 'text-text-secondary-light dark:text-text-secondary-dark'}`}
                            onClick={() => setActiveTab('all')}
                        >
                            Alle Rezepte
                        </button>
                        <button
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
                </div>

                {/* Content List */}
                <div className="flex-1 overflow-y-auto px-4 pt-4">
                    <div className="grid grid-cols-1 gap-3 pb-4">
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

                {/* Footer Action */}
                <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 border-t border-gray-100 dark:border-gray-800 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md">
                    <button
                        onClick={handleAdd}
                        disabled={selectedRecipes.size === 0 || isSubmitting}
                        className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-lg shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative overflow-hidden"
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

export default AddMealModal;
