import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import Sidebar from './Sidebar';
import RecipeHero from './RecipeHero';
import RecipeMeta from './RecipeMeta';
import Ingredients from './Ingredients';
import Instructions from './Instructions';
import AddRecipeModal from './AddRecipeModal';
import { Recipe } from '../types';

const RecipeDetail: React.FC = () => {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [highlightedIngredientIndex, setHighlightedIngredientIndex] = useState<number | null>(null);

  // Queries & Mutations
  const recipes = useQuery(api.recipes.list, {});
  const deleteRecipe = useMutation(api.recipes.deleteRecipe);

  // Effect: Wähle das erste Rezept aus, sobald Daten geladen sind
  // und noch keines ausgewählt ist.
  useEffect(() => {
    if (recipes && recipes.length > 0 && !selectedRecipeId) {
      setSelectedRecipeId(recipes[0]._id);
    }
  }, [recipes, selectedRecipeId]);

  // Einzelnes Rezept laden
  const activeRecipe = useQuery(api.recipes.get, 
    selectedRecipeId ? { id: selectedRecipeId as Id<"recipes"> } : "skip"
  );

  // Handlers
  const handleDelete = async () => {
    if (!selectedRecipeId) return;
    
    await deleteRecipe({ id: selectedRecipeId as Id<"recipes"> });
    
    // Nach dem Löschen: Wähle ein anderes Rezept oder null
    const remaining = recipes?.filter(r => r._id !== selectedRecipeId) || [];
    if (remaining.length > 0) {
      setSelectedRecipeId(remaining[0]._id);
    } else {
      setSelectedRecipeId(null);
    }
  };

  const handleEdit = () => {
    if (activeRecipe) {
      setEditingRecipe(activeRecipe);
      setIsAddModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setEditingRecipe(null); // Reset editing state
  };

  // Loading State
  if (recipes === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <div className="animate-pulse text-primary font-bold text-xl">Lade Rezepte aus der Cloud...</div>
      </div>
    );
  }

  // Empty State
  if (recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-light dark:bg-background-dark p-6 text-center">
        <h2 className="text-2xl font-bold mb-4 dark:text-white">Willkommen bei Cookly!</h2>
        <p className="mb-6 text-gray-600 dark:text-gray-300">Deine Datenbank ist noch leer.</p>
        <div className="flex gap-4">
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="px-6 py-3 bg-primary text-white font-bold rounded-lg shadow-neomorphism-outset hover:scale-105 transition-transform"
          >
            Neues Rezept anlegen
          </button>
        </div>
        <AddRecipeModal isOpen={isAddModalOpen} onClose={handleCloseModal} />
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-screen overflow-x-hidden group/design-root">
      
      <AddRecipeModal 
        isOpen={isAddModalOpen} 
        onClose={handleCloseModal} 
        initialData={editingRecipe}
      />

      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        recipes={recipes || []}
        selectedRecipeId={selectedRecipeId}
        onRecipeSelect={(id) => {
          setSelectedRecipeId(id);
          setIsSidebarOpen(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Floating Toggle Button (Sticky) */}
      <button 
        onClick={() => setIsSidebarOpen(true)}
        className={`fixed top-1/2 -translate-y-1/2 left-0 z-50 w-6 h-20 bg-background-light dark:bg-background-dark/80 rounded-r-full flex items-center justify-center shadow-lg dark:shadow-md dark:shadow-black/50 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-64 opacity-0' : 'translate-x-0'}`}
      >
        <span className="material-symbols-outlined text-gray-500 dark:text-gray-400">chevron_right</span>
      </button>

      {/* Floating Add Button */}
      <button 
        onClick={() => {
          setEditingRecipe(null);
          setIsAddModalOpen(true);
        }}
        className="fixed bottom-6 right-6 z-50 size-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        title="Neues Rezept hinzufügen"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      <main className="relative z-10">
        {activeRecipe ? (
          <>
            <RecipeHero 
              recipe={activeRecipe} 
              onSidebarToggle={() => setIsSidebarOpen(true)} 
              onEdit={handleEdit}
              onDelete={handleDelete}
            />

              <div className="relative z-20">
                <div className="mx-4 p-6 rounded-3xl glassmorphism">
                  <RecipeMeta recipe={activeRecipe} />
                  <Ingredients 
                    ingredients={activeRecipe.ingredients} 
                    highlightedIndex={highlightedIngredientIndex}
                  />
                  <Instructions 
                    instructions={activeRecipe.instructions} 
                    ingredients={activeRecipe.ingredients}
                    highlightedIndex={highlightedIngredientIndex}
                    onToggleHighlight={(index) => setHighlightedIngredientIndex(prev => prev === index ? null : index)}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="h-96 flex items-center justify-center dark:text-white">
              Wähle ein Rezept aus...
            </div>
          )}

        <div className="h-10"></div>
      </main>
    </div>
  );
};

export default RecipeDetail;
