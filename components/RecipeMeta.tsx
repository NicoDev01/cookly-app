import React from 'react';
import { Recipe } from '../types';
import { FaFacebook, FaInstagram, FaGlobe } from 'react-icons/fa';
import { Play } from 'lucide-react';
import type { IconType } from 'react-icons';

interface RecipeMetaProps {
  recipe: Recipe;
}

// Subtle pulse: play icon briefly appears and fades out smoothly
// Total cycle: 7s
// 0–5s   (0–71%):  social visible, play hidden
// 5–5.5s (71–78%): crossfade → play fades in
// 5.5–6.5s (78–93%): play visible
// 6.5–7s (93–100%): crossfade → social back
const morphStyles = `
  @keyframes socialOut {
    0%, 71%   { opacity: 1; }
    78%, 93%  { opacity: 0; }
    100%      { opacity: 1; }
  }
  @keyframes playPulse {
    0%, 71%   { opacity: 0; }
    78%, 93%  { opacity: 1; }
    100%      { opacity: 0; }
  }
  .icon-social-morph {
    animation: socialOut 7s ease-in-out infinite;
  }
  .icon-play-morph {
    animation: playPulse 7s ease-in-out infinite;
  }
`;



const RecipeMeta: React.FC<RecipeMetaProps> = ({ recipe }) => {
  // Defensive: ensure all values are renderable (not objects)
  const title = typeof recipe.title === 'string' ? recipe.title : String(recipe.title ?? '');
  const prepTime = typeof recipe.prepTimeMinutes === 'number' ? recipe.prepTimeMinutes : Number(recipe.prepTimeMinutes) || 0;
  const difficulty = typeof recipe.difficulty === 'string' ? recipe.difficulty : String(recipe.difficulty ?? '');
  const portions = typeof recipe.portions === 'number' ? recipe.portions : Number(recipe.portions) || 0;

  // Determine source type (Instagram vs. Facebook vs. Website)
  const isInstagram = recipe.sourceUrl?.includes('instagram.com');
  const isFacebook = recipe.sourceUrl?.includes('facebook.com');

  // Use react-icons (Font Awesome) for reliable brand icons
  let SourceIcon: IconType = FaGlobe;
  let sourceLabel: string;

  if (isInstagram) {
    SourceIcon = FaInstagram;
    sourceLabel = 'IG';
  } else if (isFacebook) {
    SourceIcon = FaFacebook;
    sourceLabel = 'FB';
  } else {
    SourceIcon = FaGlobe;
    sourceLabel = 'Web';
  }

  return (
    <div className="mb-2">
      <style>{morphStyles}</style>
      <h1 className="uppercase  text-[#111718] dark:text-white tracking-tight text-3xl font-black leading-tight">
        {title}
      </h1>
      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-0.5 whitespace-nowrap">
          <span className="material-symbols-outlined !text-sm">timer</span>
          <span>{prepTime} Min</span>
        </div>
        <div className="flex items-center gap-0.5 whitespace-nowrap">
          <span>{difficulty}</span>
        </div>
        <div className="flex items-center gap-0.5 whitespace-nowrap">
          <span className="material-symbols-outlined !text-sm">groups</span>
          <span>{portions} Portionen</span>
        </div>
        {recipe.sourceUrl && (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 whitespace-nowrap hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sequential fade: social out first, then play in */}
            <span className="relative inline-flex items-center justify-center w-[14px] h-[14px]">
              <SourceIcon
                className="!text-sm absolute icon-social-morph"
                aria-hidden
              />
              <Play
                size={14}
                className="absolute icon-play-morph"
                aria-hidden
                strokeWidth={2.5}
              />
            </span>
            <span>{sourceLabel}</span>
          </a>
        )}
      </div>
    </div>
  );
};

export default RecipeMeta;