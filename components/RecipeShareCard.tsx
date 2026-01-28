import React, { useRef } from 'react';
import { Recipe } from '../types';
import { SafeImage } from './SafeImage';

interface RecipeShareCardProps {
  recipe: Recipe;
}

/**
 * RecipeShareCard - Versteckte Komponente zum Generieren von teilbaren Rezept-Bildern
 * Diese Komponente wird von html2canvas gerendert, um ein Bild zu generieren
 *
 * Verwendung:
 * 1. Komponente mit der recipe ID rendern (unsichtbar positioniert)
 * 2. generateRecipeShareImage() aufrufen
 * 3. Generiertes Bild wird geteilt
 */
export const RecipeShareCard: React.FC<RecipeShareCardProps> = ({ recipe }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div
      id="recipe-share-card"
      ref={cardRef}
      className="fixed -left-[9999px] top-0 w-[600px] bg-gradient-to-br from-[#1e3031] to-[#0f1c1d] text-white p-8 rounded-2xl"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-2xl">restaurant</span>
        </div>
        <div>
          <h2 className="text-lg font-bold">Cookly</h2>
          <p className="text-xs text-gray-400">Mein Rezept</p>
        </div>
      </div>

      {/* Recipe Image */}
      {recipe.image && (
        <div className="w-full h-64 rounded-xl overflow-hidden mb-6">
          <SafeImage
            src={recipe.image}
            alt={recipe.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Recipe Title */}
      <h1 className="text-3xl font-bold mb-2">{recipe.title}</h1>

      {/* Meta Info */}
      <div className="flex items-center gap-4 mb-6 text-sm text-gray-300">
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-base">schedule</span>
          <span>{recipe.prepTimeMinutes} Min</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-base">restaurant</span>
          <span>{recipe.portions} Portionen</span>
        </div>
        <div className="px-2 py-1 bg-primary/20 rounded-full text-xs font-medium">
          {recipe.category}
        </div>
      </div>

      {/* Ingredients Preview */}
      {recipe.ingredients && recipe.ingredients.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-bold mb-3">Zutaten</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {recipe.ingredients.slice(0, 6).map((ing, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>
                  {ing.amount && <span className="text-gray-400">{ing.amount} </span>}
                  {ing.name}
                </span>
              </div>
            ))}
            {recipe.ingredients.length > 6 && (
              <div className="text-gray-400 italic">
                +{recipe.ingredients.length - 6} weitere Zutaten...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-6 border-t border-gray-700 text-center text-sm text-gray-400">
        Erstellt mit Cookly App
      </div>
    </div>
  );
};

/**
 * Generiert ein teilbares Bild aus einem Rezept
 * Verwendet html2canvas um die RecipeShareCard Komponente in ein Bild zu konvertieren
 */
export const generateRecipeShareImage = async (recipe: Recipe): Promise<void> => {
  // Dynamisch importieren, um Bundle-Größe zu reduzieren
  const html2canvas = (await import('html2canvas')).default;

  const element = document.getElementById('recipe-share-card');
  if (!element) {
    throw new Error('Recipe share card element not found');
  }

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#1e3031',
      scale: 2, // Retina Qualität
      useCORS: true, // CORS für externe Bilder
      logging: false,
    });

    canvas.toBlob(async (blob) => {
      if (!blob) {
        console.error('Failed to generate image blob');
        return;
      }

      const file = new File([blob], `${recipe.title.replace(/[^a-z0-9]/gi, '_')}.png`, {
        type: 'image/png',
      });

      // Prüfen ob Web Share API verfügbar ist
      if (navigator.share && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: recipe.title,
            text: `Schau dir dieses Rezept an: ${recipe.title}`,
          });
        } catch (err) {
          // User hat abgebrochen - kein Fehler
          if ((err as Error).name !== 'AbortError') {
            console.error('Share failed:', err);
          }
        }
      } else {
        // Fallback: Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${recipe.title.replace(/[^a-z0-9]/gi, '_')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  } catch (error) {
    console.error('Error generating share image:', error);
    throw error;
  }
};

export default RecipeShareCard;
