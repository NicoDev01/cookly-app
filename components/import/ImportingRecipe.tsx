import React, { useState } from 'react';
import RecipeMeta from '../RecipeMeta';
import Instructions from '../Instructions';
import { sizedImageUrl } from '../../utils/imageUrl';
import type { Recipe } from '../../types';

const Bone: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span aria-hidden className={`imp-bone ${className}`} />
);

const INGREDIENT_COLORS = [
  'bg-ingredient-1-bg', 'bg-ingredient-2-bg', 'bg-ingredient-3-bg', 'bg-ingredient-4-bg', 'bg-ingredient-5-bg',
  'bg-ingredient-6-bg', 'bg-ingredient-7-bg', 'bg-ingredient-8-bg', 'bg-ingredient-9-bg', 'bg-ingredient-10-bg',
];
/** Breiten der Zutaten-Platzhalter, damit sie wie echte Pills unterschiedlich lang wirken. */
const PILL_WIDTHS = ['w-[72px]', 'w-[132px]', 'w-[96px]', 'w-[84px]', 'w-[124px]', 'w-[108px]', 'w-[150px]', 'w-[90px]'];
const SKELETON_STEPS = 4;

/**
 * Die Rezeptseite, während der Import läuft: gleiches Layout wie RecipeSlideContent in pages/RecipePage.tsx,
 * Platzhalter wo Daten fehlen. Titel erst mit dem fertigen Rezept (der Caption-Titel ist oft kein Rezeptname),
 * das Bild schon nach dem Laden des Beitrags. Zutaten und Schritte kommen gestaffelt (ingredientCount/stepCount).
 * Read-only: Einkaufsliste, Favorit und Kochmodus gibt es erst auf der echten Rezeptseite.
 */
const ImportingRecipe: React.FC<{
  image: string | null;
  /** Bild ist schon geladen und ersetzt ein gleich aussehendes Vorschaubild: ohne Einblenden tauschen. */
  imageInstant?: boolean;
  recipe: Recipe | null;
  ingredientCount: number;
  stepCount: number;
  onBack: () => void;
}> = ({ image, imageInstant, recipe, ingredientCount, stepCount, onBack }) => {
  const pillBones = recipe ? recipe.ingredients.length - ingredientCount : PILL_WIDTHS.length;
  const stepBones = recipe ? recipe.instructions.length - stepCount : SKELETON_STEPS;

  return (
    <main className={`imp-open relative z-10 flex min-h-[100dvh] flex-1 flex-col bg-white pb-48`} aria-busy={!recipe}>
      <ImportHero image={image} instant={imageInstant} onBack={onBack} />

      <div className="relative z-20 -mt-3 mx-2 mb-2 flex-1 p-6 rounded-3xl glassmorphism bg-white/60 backdrop-blur-xl shadow-neo-light-convex border border-gray-100 md:mx-auto md:max-w-2xl lg:max-w-3xl">
        {recipe ? (
          <div className="imp-meta">
            <RecipeMeta recipe={recipe} selectedPortions={Number(recipe.portions) || 0} onPortionsChange={() => undefined} />
          </div>
        ) : (
          <div className="mb-2">
            <Bone className="my-[3px] h-[31px] w-3/5 rounded-[10px]" />
            <div className="mt-2 flex h-[26px] items-center gap-4">
              <Bone className="h-5 w-[112px] rounded-full" />
              <Bone className="h-4 w-8" />
              <Bone className="h-[26px] w-[104px] rounded-full" />
            </div>
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-xl font-bold mb-4 text-[#111718] dark:text-white">Zutaten</h2>
          <div className="flex flex-wrap gap-2.5">
            {recipe?.ingredients.slice(0, ingredientCount).map((ing, index) => (
              <div
                key={`${ing.name}-${index}`}
                className={`imp-pill-in relative px-3 py-[5px] rounded-full text-sm font-medium ${INGREDIENT_COLORS[index % INGREDIENT_COLORS.length]} text-black shadow-neomorphism-pill`}
              >
                {ing.amount && <span>{ing.amount} </span>}
                {ing.name}
              </div>
            ))}
            {Array.from({ length: Math.max(0, pillBones) }, (_, i) => (
              <Bone key={`pill-${i}`} className={`h-[30px] rounded-full ${PILL_WIDTHS[(i + ingredientCount) % PILL_WIDTHS.length]}`} />
            ))}
          </div>
        </div>

        {recipe && stepCount > 0 ? (
          <div className="imp-steps">
            <Instructions instructions={recipe.instructions.slice(0, stepCount)} ingredients={recipe.ingredients} />
          </div>
        ) : (
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4 text-[#111718] dark:text-white">Zubereitung</h2>
          </div>
        )}
        {stepBones > 0 && (
          <ol className={`space-y-4 ${stepCount > 0 ? 'mt-4' : ''}`}>
            {Array.from({ length: stepBones }, (_, i) => (
              <li key={i} className="flex items-start gap-3">
                <Bone className="mt-1 size-5 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2.5 pt-1.5">
                  <Bone className="h-3.5 w-full" />
                  <Bone className={`h-3.5 ${i % 2 ? 'w-1/2' : 'w-4/5'}`} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
};

/**
 * Wie components/RecipeHero.tsx: Zurück-Knopf unter der Notch, Bild in voller Breite mit Verlauf nach Weiß.
 * Favorit, Wochenplan und Menü sind angedeutet, aber erst auf der echten Rezeptseite bedienbar.
 */
const ImportHero: React.FC<{ image: string | null; instant?: boolean; onBack: () => void }> = ({ image, instant, onBack }) => (
  <div className="flex flex-col w-full bg-white">
    <div className="sticky top-0 z-40 h-0 w-full">
      <div className="absolute top-0 left-0 right-0 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} aria-label="Zurück" title="Zurück" className={`${GLASS} active:scale-95 transition-transform`}>
            <span className="material-symbols-outlined !text-[28px]">arrow_back</span>
          </button>
          <div className="flex items-center gap-1 opacity-40" aria-hidden>
            {['favorite', 'bookmark_add', 'more_vert'].map((icon) => (
              <span key={icon} className={GLASS}>
                <span className="material-symbols-outlined !text-[28px]">{icon}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
    <div className="relative w-full overflow-hidden bg-white" style={{ maxHeight: '70vh' }}>
      {image ? <HeroImage key={image} src={image} instant={instant} /> : <HeroBone />}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-white" />
    </div>
  </div>
);

const HeroBone = () => (
  <div className="relative aspect-[4/3] w-full">
    <Bone className="absolute inset-0 rounded-none" />
  </div>
);

/** Bild erst zeigen, wenn es geladen ist; dann über den Platzhalter blenden. */
const HeroImage: React.FC<{ src: string; instant?: boolean }> = ({ src, instant }) => {
  const [loaded, setLoaded] = useState(false);
  if (instant) {
    return <img src={sizedImageUrl(src, window.innerWidth, window.devicePixelRatio || 1)} alt="" referrerPolicy="no-referrer" className="block w-full h-auto" />;
  }
  return (
    <>
      <img
        src={sizedImageUrl(src, window.innerWidth, window.devicePixelRatio || 1)}
        alt=""
        referrerPolicy="no-referrer"
        loading="eager"
        onLoad={() => setLoaded(true)}
        className={loaded ? 'imp-hero-img block w-full h-auto' : 'absolute inset-0 w-full opacity-0'}
      />
      {loaded ? (
        <div className="imp-veil pointer-events-none absolute inset-0">
          <Bone className="absolute inset-0 rounded-none" />
        </div>
      ) : (
        <HeroBone />
      )}
    </>
  );
};

const GLASS = 'flex items-center justify-center size-10 rounded-full bg-white/85 backdrop-blur-xl border border-white/40 shadow-lg shadow-black/5 text-gray-800';

export default ImportingRecipe;
