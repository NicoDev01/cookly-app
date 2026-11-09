import React from 'react';
import { Recipe } from '../types';
import { FaFacebook, FaInstagram, FaTiktok, FaGlobe } from 'react-icons/fa';
import { ChefHat, Link2, Minus, Plus } from 'lucide-react';
import type { IconType } from 'react-icons';

interface RecipeMetaProps {
  recipe: Recipe;
  /** Gewählte Portionen; die Rezeptseite rechnet die Zutaten darauf um. */
  selectedPortions: number;
  onPortionsChange: (portions: number) => void;
  onStartCooking?: () => void;
}

// Quelle: 3 s Plattform-Icon, dann kurz (≈1 s) das Link-Icon, nie beide gleichzeitig.
// Zyklus 4,4 s: 0–68 % Plattform · 68–73 % aus · 73–77 % Link ein · 77–91 % Link · 91–95 % aus · 95–100 % Plattform ein
const morphStyles = `
  @keyframes sourcePlatform {
    0%, 68%  { opacity: 1; transform: scale(1); }
    73%, 95% { opacity: 0; transform: scale(0.6); }
    100%     { opacity: 1; transform: scale(1); }
  }
  @keyframes sourceLink {
    0%, 73%  { opacity: 0; transform: scale(0.6); }
    77%, 91% { opacity: 1; transform: scale(1); }
    95%, 100% { opacity: 0; transform: scale(0.6); }
  }
  .source-icon-platform { animation: sourcePlatform 4.4s ease-in-out infinite; }
  .source-icon-link { animation: sourceLink 4.4s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .source-icon-platform { animation: none; }
    .source-icon-link { animation: none; opacity: 0; }
  }
`;


export const MIN_PORTIONS = 1;
export const MAX_PORTIONS = 50;

const RecipeMeta: React.FC<RecipeMetaProps> = ({ recipe, selectedPortions, onPortionsChange, onStartCooking }) => {
  // Defensive: ensure all values are renderable (not objects)
  const title = typeof recipe.title === 'string' ? recipe.title : String(recipe.title ?? '');
  const portions = typeof recipe.portions === 'number' ? recipe.portions : Number(recipe.portions) || 0;
  const canScale = portions > 0;
  const shownPortions = canScale ? selectedPortions : portions;
  const isScaled = canScale && shownPortions !== portions;

  // Determine source type (Instagram vs. Facebook vs. TikTok vs. Website)
  const isInstagram = recipe.sourceUrl?.includes('instagram.com');
  const isFacebook = recipe.sourceUrl?.includes('facebook.com');
  const isTiktok = recipe.sourceUrl?.includes('tiktok.com');

  // Use react-icons (Font Awesome) for reliable brand icons
  let SourceIcon: IconType = FaGlobe;
  let sourceLabel: string;

  if (isInstagram) {
    SourceIcon = FaInstagram;
    sourceLabel = 'IG';
  } else if (isFacebook) {
    SourceIcon = FaFacebook;
    sourceLabel = 'FB';
  } else if (isTiktok) {
    SourceIcon = FaTiktok;
    sourceLabel = 'TT';
  } else {
    SourceIcon = FaGlobe;
    sourceLabel = 'Web';
  }

  return (
    <div className="mb-2">
      <style>{morphStyles}</style>
      <h1 className="uppercase text-[#111718] dark:text-white tracking-tight text-3xl font-black leading-tight">
        {title}
      </h1>
      {/* Eine ruhige Zeile: Portionen · Quelle · Kochmodus */}
      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        {canScale ? (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <button
              type="button"
              aria-label="Eine Portion weniger"
              disabled={shownPortions <= MIN_PORTIONS}
              onClick={() => onPortionsChange(Math.max(MIN_PORTIONS, shownPortions - 1))}
              className="relative flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset ring-gray-300 transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-[#111718] hover:ring-[#111718] active:scale-90 disabled:opacity-30 dark:ring-gray-600"
            >
              <Minus size={10} strokeWidth={2.5} aria-hidden />
            </button>
            {/* Geänderte Zahl dunkler, damit man sieht, dass umgerechnet wird. */}
            <span className={isScaled ? 'font-semibold text-[#111718] dark:text-white' : undefined}>
              {shownPortions} {shownPortions === 1 ? 'Portion' : 'Portionen'}
            </span>
            <button
              type="button"
              aria-label="Eine Portion mehr"
              disabled={shownPortions >= MAX_PORTIONS}
              onClick={() => onPortionsChange(Math.min(MAX_PORTIONS, shownPortions + 1))}
              className="relative flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset ring-gray-300 transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-[#111718] hover:ring-[#111718] active:scale-90 disabled:opacity-30 dark:ring-gray-600"
            >
              <Plus size={10} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        ) : null}
        {recipe.sourceUrl && (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 whitespace-nowrap transition-colors hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Wechselt zwischen Plattform-Icon und Link-Icon: zeigt, dass es ein Link ist */}
            <span className="relative inline-flex h-[12px] w-[12px] items-center justify-center">
              <SourceIcon className="!text-xs absolute source-icon-platform" aria-hidden />
              <Link2 size={13} className="absolute source-icon-link" aria-hidden strokeWidth={2.5} />
            </span>
            <span>{sourceLabel}</span>
          </a>
        )}
        {/* Öffnet den Kochmodus (CookMode). */}
        <button
          type="button"
          onClick={onStartCooking}
          className="flex items-center gap-1 whitespace-nowrap transition-colors hover:text-[#111718] dark:hover:text-white"
        >
          <ChefHat size={13} strokeWidth={2.25} aria-hidden />
          Kochmodus
        </button>
      </div>
    </div>
  );
};

export default RecipeMeta;
