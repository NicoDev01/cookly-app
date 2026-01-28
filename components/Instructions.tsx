import React from 'react';
import { Instruction, Ingredient } from '../types';
import { sanitizeMaterialSymbolName } from '../utils/iconUtils';

interface InstructionsProps {
  instructions: Instruction[];
  ingredients?: Ingredient[];
}

const Instructions: React.FC<InstructionsProps> = ({ instructions, ingredients = [] }) => {

  // Helper to cycle through colors defined in tailwind config (same as in Ingredients.tsx)
  const INGREDIENT_COLORS = [
    'bg-ingredient-1-bg',
    'bg-ingredient-2-bg',
    'bg-ingredient-3-bg',
    'bg-ingredient-4-bg',
    'bg-ingredient-5-bg',
    'bg-ingredient-6-bg',
    'bg-ingredient-7-bg',
    'bg-ingredient-8-bg',
    'bg-ingredient-9-bg',
    'bg-ingredient-10-bg',
  ];

  const getColorClass = (index: number) => {
    return INGREDIENT_COLORS[index % INGREDIENT_COLORS.length];
  };

  const renderTextWithHighlights = (text: string) => {
    // Defensive: ensure text is a string (AI might return object)
    if (typeof text !== 'string') {
      console.warn('Instructions: step.text is not a string:', text);
      return String(text ?? '');
    }
    if (!ingredients || ingredients.length === 0) return text;

    // 1. Prepare ingredients: Extract significant keywords
    // Wir zerlegen den Zutatennamen in einzelne Wörter und filtern Füllwörter raus.
    const stopWords = [
      'g', 'kg', 'ml', 'l', 'el', 'tl', 'msp', 'prise', 'etwas', 'ca',
      'von', 'und', 'in', 'mit', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einer', 'eines',
      'große', 'kleine', 'mittlere', 'groß', 'klein', 'mittel',
      'befreit', 'steinen', 'gewaschen', 'gehackt', 'gewürfelt', 'scheiben', 'streifen', 'stücke',
      'oder', 'anderes', 'geschmacksneutrales', 'fein', 'grob', 'frisch', 'getrocknet', 'gemahlen',
      'warm', 'kalt', 'heiß', 'lauwarm', 'zum', 'für', 'bei', 'als', 'im', 'aus', 'auf',
      'nach', 'wahl', 'belieben', 'bedarf', 'garnieren', 'servieren', 'z.b.', 'z.b', 'bsp.', 'bsp',
      'evtl.', 'evtl', 'eventuell', 'optional', 'dazu', 'darüber', 'daran', 'damit', 'davon', 'dabei',
      'dafür', 'darauf', 'darin', 'darunter', 'darüber', 'unter', 'über', 'durch', 'vor', 'hinter', 'neben', 'zwischen'
    ];

    // Common base ingredients to extract from compounds (e.g. "Olivenöl" -> "Öl")
    const commonBaseIngredients = [
      'öl', 'mehl', 'zucker', 'salz', 'pfeffer', 'milch', 'sahne', 'käse', 'wurst', 'fleisch', 'fisch',
      'nudeln', 'reis', 'brot', 'ei', 'eier', 'beeren', 'nüsse', 'mandeln', 'kerne', 'samen', 'flocken',
      'saft', 'wein', 'essig', 'wasser', 'brühe', 'fond', 'sauce', 'soße', 'creme', 'quark', 'joghurt',
      'sirup', 'pulver', 'gewürz', 'kraut', 'kräuter', 'schokolade', 'kakao', 'honig', 'senf', 'ketchup', 'mayonnaise'
    ];

    const ingredientKeywords: { keyword: string; originalIndex: number }[] = [];

    ingredients.forEach((ing, idx) => {
      // Entferne Sonderzeichen und Zahlen
      const cleanName = ing.name.replace(/[0-9().,]/g, ' ');
      const words = cleanName.split(/\s+/);

      words.forEach(word => {
        const lower = word.toLowerCase().trim();
        // Allow words with length >= 2 (e.g. "Ei", "Öl")
        if (lower.length >= 2 && !stopWords.includes(lower)) {
          // Wir speichern das Originalwort für das Regex, aber vergleichen lowercase
          ingredientKeywords.push({ keyword: word, originalIndex: idx });

          // Check for common base ingredients suffix
          for (const base of commonBaseIngredients) {
            if (lower.endsWith(base) && lower !== base) {
              // Add the base ingredient as a keyword too (capitalize first letter for display if needed, but matching is case insensitive)
              // We use the base as keyword.
              // Check if base is already added for this index to avoid duplicates
              const exists = ingredientKeywords.some(k => k.keyword.toLowerCase() === base && k.originalIndex === idx);
              if (!exists) {
                // Capitalize for consistency, though regex is case insensitive
                const capitalizedBase = base.charAt(0).toUpperCase() + base.slice(1);
                ingredientKeywords.push({ keyword: capitalizedBase, originalIndex: idx });
              }
            }
          }
        }
      });
    });

    // Sort by length desc to match longest words first
    ingredientKeywords.sort((a, b) => b.keyword.length - a.keyword.length);

    // 2. Iterative replacement
    let parts: (string | React.ReactNode)[] = [text];

    ingredientKeywords.forEach(({ keyword, originalIndex }) => {
      const newParts: (string | React.ReactNode)[] = [];

      parts.forEach(part => {
        if (typeof part === 'string') {
          const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Match word boundary (start of word) using lookbehind for unicode support
          // Matches keyword followed by any word characters (to catch plurals/compounds starting with keyword)
          const wordChar = '[a-zA-Z0-9_\\u00C0-\\u00FF]';
          const regex = new RegExp(`(?<!${wordChar})(${escapedKeyword}${wordChar}*)`, 'gi');

          const split = part.split(regex);

          split.forEach((segment) => {
            // Check if segment starts with keyword (case insensitive)
            if (segment.toLowerCase().startsWith(keyword.toLowerCase())) {
              // CRITICAL FIX: Check if the matched segment is a stop word!
              // This prevents "Ei" matching "Ein" (because "Ein" is a stop word)
              if (stopWords.includes(segment.toLowerCase())) {
                newParts.push(segment);
                return;
              }

              newParts.push(
                <span
                  key={`${keyword}-${originalIndex}-${Math.random()}`}
                  className={`px-1.5 py-0.5 rounded-full text-sm font-medium ${getColorClass(originalIndex)} text-black dark:text-white mx-0.5 shadow-sm`}
                >
                  {segment}
                </span>
              );
            } else {
              if (segment) newParts.push(segment);
            }
          });
        } else {
          newParts.push(part);
        }
      });
      parts = newParts;
    });

    return parts;
  };

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4 text-[#111718] dark:text-white">Zubereitung</h2>
      <ol className="space-y-4 text-gray-800 dark:text-gray-200">
        {instructions.map((step, index) => {
          // Defensive: ensure step is an object with text property
          const stepText = typeof step === 'object' && step !== null
            ? (typeof step.text === 'string' ? step.text : String(step.text ?? ''))
            : String(step ?? '');
          const stepIcon = typeof step === 'object' && step !== null ? step.icon : undefined;

          return (
            <li key={index} className="flex items-start gap-3">
              <span className="material-symbols-outlined !text-xl !leading-tight text-gray-500 dark:text-gray-400 pt-0.5">
                {sanitizeMaterialSymbolName(stepIcon) || 'circle'}
              </span>
              <span className="leading-relaxed">
                {renderTextWithHighlights(stepText)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default Instructions;
