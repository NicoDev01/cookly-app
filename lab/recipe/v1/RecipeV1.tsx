import React, { useMemo, useState } from 'react';
import type { Recipe } from '../../../types';
import LabRecipeHero from './LabRecipeHero';
import LabRecipeMeta from './LabRecipeMeta';
import LabIngredients from './LabIngredients';
import LabInstructions from './LabInstructions';
import { scaleAmount } from '../../../utils/scaleAmount';
import LabCookMode from './LabCookMode';
import LabTimerPills from './LabTimerPills';
import { useCookTimers } from '../../../hooks/useCookTimers';

/** v1 = Arbeitsstand. Startet als exakte Kopie von v0; alle Teile liegen in diesem Ordner und dürfen frei geändert werden. */
const RecipeV1: React.FC<{ recipe: Recipe }> = ({ recipe }) => {
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [isCooking, setIsCooking] = useState(false);
  // Stand des Kochmodus: nach versehentlichem Schließen geht es am selben Schritt weiter.
  const [cookStep, setCookStep] = useState(0);
  const timers = useCookTimers();
  const openCooking = (step?: number) => {
    if (step !== undefined) setCookStep(step);
    setIsCooking(true);
  };

  // Portionen gelten nur für diese Ansicht; beim nächsten Öffnen wieder die Rezept-Portionen.
  const basePortions = Number(recipe.portions) || 0;
  const [portions, setPortions] = useState(basePortions);
  const factor = basePortions > 0 ? portions / basePortions : 1;
  const scaledIngredients = useMemo(
    () => recipe.ingredients.map((ing) => ({ ...ing, amount: scaleAmount(ing.amount, factor) })),
    [recipe.ingredients, factor],
  );

  return (
    <main className="relative z-10 flex min-h-full flex-1 flex-col bg-white">
      <LabRecipeHero recipe={recipe} onSidebarToggle={() => window.history.back()} onEdit={() => undefined} onDelete={() => undefined} />
      <div className="relative z-20 -mt-3 mx-2 mb-2 flex-1 p-6 rounded-3xl glassmorphism bg-white/60 backdrop-blur-xl shadow-neo-light-convex border border-gray-100 md:mx-auto md:max-w-2xl lg:max-w-3xl">
        <LabRecipeMeta recipe={recipe} selectedPortions={portions} onPortionsChange={setPortions} onStartCooking={() => openCooking()} />
        {/* Umgerechnete Mengen; so landet auch im Einkaufszettel die gewählte Menge. */}
        <LabIngredients ingredients={scaledIngredients} highlightedIndex={highlighted} />
        <LabInstructions
          instructions={recipe.instructions}
          ingredients={recipe.ingredients}
          highlightedIndex={highlighted}
          onToggleHighlight={(index) => setHighlighted((current) => (current === index ? null : index))}
        />
      </div>
      {isCooking && (
        <LabCookMode
          title={recipe.title}
          instructions={recipe.instructions}
          ingredients={scaledIngredients}
          timers={timers}
          initialStep={cookStep}
          onStepChange={setCookStep}
          onClose={() => setIsCooking(false)}
          onFinish={() => {
            setIsCooking(false);
            setCookStep(0);
            timers.clearDone();
          }}
        />
      )}
      {/* Laufende Timer bleiben sichtbar, wenn der Kochmodus zu ist; Tipp führt zurück zum Schritt. */}
      {!isCooking && timers.timers.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >
          <LabTimerPills
            className="rounded-full bg-white/90 p-1.5 shadow-lg shadow-black/10 backdrop-blur-xl"
            timers={timers.timers}
            now={timers.now}
            onToggle={timers.toggle}
            onRemove={timers.remove}
            onSelect={(t) => openCooking(t.step)}
          />
        </div>
      )}
    </main>
  );
};

export default RecipeV1;
