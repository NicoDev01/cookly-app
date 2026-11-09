import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import RecipeMeta from '../../../components/RecipeMeta';
import Instructions from '../../../components/Instructions';
import CookMode from '../../../components/CookMode';
import CookTimerPills from '../../../components/CookTimerPills';
import { useCookTimers } from '../../../hooks/useCookTimers';
import { scaleAmount } from '../../../utils/scaleAmount';
import type { Recipe } from '../../../types';
import LabRecipeHero from './LabRecipeHero';
import LabIngredients from './LabIngredients';

/**
 * v0 = Original. Gleiches Layout wie RecipeSlideContent in pages/RecipePage.tsx.
 * RecipeMeta, Instructions und Kochmodus kommen direkt aus der App, damit v0 immer dem echten Stand folgt.
 * Nicht verändern: Neue Ideen gehören in eine eigene Variante.
 */
const RecipeV0: React.FC<{ recipe: Recipe }> = ({ recipe }) => {
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const basePortions = Number(recipe.portions) || 0;
  const [portions, setPortions] = useState(basePortions);
  const factor = basePortions > 0 ? portions / basePortions : 1;
  const scaledIngredients = useMemo(
    () => recipe.ingredients.map((ing) => ({ ...ing, amount: scaleAmount(ing.amount, factor) })),
    [recipe.ingredients, factor],
  );
  const [isCooking, setIsCooking] = useState(false);
  const [cookStep, setCookStep] = useState(0);
  const timers = useCookTimers();

  return (
    <main className="relative z-10 flex min-h-full flex-1 flex-col bg-white">
      <LabRecipeHero recipe={recipe} onSidebarToggle={() => window.history.back()} onEdit={() => undefined} onDelete={() => undefined} />
      <div className="relative z-20 -mt-3 mx-2 mb-2 flex-1 p-6 rounded-3xl glassmorphism bg-white/60 backdrop-blur-xl shadow-neo-light-convex border border-gray-100 md:mx-auto md:max-w-2xl lg:max-w-3xl">
        <RecipeMeta recipe={recipe} selectedPortions={portions} onPortionsChange={setPortions} onStartCooking={() => setIsCooking(true)} />
        <LabIngredients ingredients={scaledIngredients} highlightedIndex={highlighted} />
        <Instructions
          instructions={recipe.instructions}
          ingredients={recipe.ingredients}
          highlightedIndex={highlighted}
          onToggleHighlight={(index) => setHighlighted((current) => (current === index ? null : index))}
        />
      </div>
      {isCooking && (
        <CookMode
          title={recipe.title}
          instructions={recipe.instructions}
          ingredients={scaledIngredients}
          timers={timers}
          initialStep={cookStep}
          onStepChange={setCookStep}
          onClose={() => setIsCooking(false)}
          onFinish={() => { setIsCooking(false); setCookStep(0); timers.clearDone(); }}
        />
      )}
      {!isCooking && timers.timers.length > 0 && createPortal(
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>
          <CookTimerPills
            className="rounded-full bg-white/90 p-1.5 shadow-lg shadow-black/10 backdrop-blur-xl"
            timers={timers.timers}
            now={timers.now}
            onToggle={timers.toggle}
            onRemove={timers.remove}
            onSelect={(t) => { setCookStep(t.step); setIsCooking(true); }}
          />
        </div>,
        document.body,
      )}
    </main>
  );
};

export default RecipeV0;
