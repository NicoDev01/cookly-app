import React, { useState } from 'react';
import RecipeMeta from '../../../components/RecipeMeta';
import Instructions from '../../../components/Instructions';
import type { Recipe } from '../../../types';
import LabRecipeHero from './LabRecipeHero';
import LabIngredients from './LabIngredients';

/**
 * v0 = Original. Gleiches Layout wie RecipeSlideContent in pages/RecipePage.tsx.
 * RecipeMeta und Instructions kommen direkt aus der App, damit v0 immer dem echten Stand folgt.
 * Nicht verändern: Neue Ideen gehören in eine eigene Variante.
 */
const RecipeV0: React.FC<{ recipe: Recipe }> = ({ recipe }) => {
  const [highlighted, setHighlighted] = useState<number | null>(null);
  return (
    <main className="relative z-10 flex min-h-full flex-1 flex-col bg-white">
      <LabRecipeHero recipe={recipe} onSidebarToggle={() => window.history.back()} onEdit={() => undefined} onDelete={() => undefined} />
      <div className="relative z-20 -mt-3 mx-2 mb-2 flex-1 p-6 rounded-3xl glassmorphism bg-white/60 backdrop-blur-xl shadow-neo-light-convex border border-gray-100 md:mx-auto md:max-w-2xl lg:max-w-3xl">
        <RecipeMeta recipe={recipe} />
        <LabIngredients ingredients={recipe.ingredients} highlightedIndex={highlighted} />
        <Instructions
          instructions={recipe.instructions}
          ingredients={recipe.ingredients}
          highlightedIndex={highlighted}
          onToggleHighlight={(index) => setHighlighted((current) => (current === index ? null : index))}
        />
      </div>
    </main>
  );
};

export default RecipeV0;
