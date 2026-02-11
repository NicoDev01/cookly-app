import React from 'react';
import { Instruction, Ingredient } from '../types';
import { sanitizeMaterialSymbolName } from '../utils/iconUtils';

interface InstructionsProps {
  instructions: Instruction[];
  ingredients?: Ingredient[];
  highlightedIndex?: number | null;
  onToggleHighlight?: (index: number) => void;
}

const Instructions: React.FC<InstructionsProps> = ({ instructions, ingredients = [], highlightedIndex, onToggleHighlight }) => {

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
    // Defensive: ensure text is a string
    if (typeof text !== 'string') {
      return String(text ?? '');
    }
    if (!ingredients || ingredients.length === 0) return text;

    // 1. Setup Lists & Dictionaries
    
    // Words to ignore to prevent false positives
    const stopWords = [
      'g', 'kg', 'ml', 'l', 'el', 'tl', 'msp', 'prise', 'etwas', 'ca',
      'von', 'und', 'in', 'mit', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einer', 'eines',
      'große', 'kleine', 'mittlere', 'groß', 'klein', 'mittel',
      'befreit', 'steinen', 'gewaschen', 'gehackt', 'gewürfelt', 'scheiben', 'streifen', 'stücke',
      'oder', 'anderes', 'geschmacksneutrales', 'fein', 'grob', 'frisch', 'getrocknet', 'gemahlen',
      'warm', 'kalt', 'heiß', 'lauwarm', 'zum', 'für', 'bei', 'als', 'im', 'aus', 'auf',
      'nach', 'wahl', 'belieben', 'bedarf', 'garnieren', 'servieren', 'z.b.', 'z.b', 'bsp.', 'bsp',
      'evtl.', 'evtl', 'eventuell', 'optional', 'dazu', 'darüber', 'daran', 'damit', 'davon', 'dabei',
      'dafür', 'darauf', 'darin', 'darunter', 'darüber', 'unter', 'über', 'durch', 'vor', 'hinter', 'neben', 'zwischen',
      'dose', 'dosen', 'glas', 'gläser', 'becher', 'packung', 'päckchen', 'bund', 'stange', 'stangen', 'zehe', 'zehen'
    ];

    // Base ingredients to extract from compounds (Suffix Match)
    // "Olivenöl" ends with "öl" -> match "Öl" in text
    const commonBaseIngredients = [
      'öl', 'mehl', 'zucker', 'salz', 'pfeffer', 'milch', 'sahne', 'käse', 'wurst', 'fleisch', 'fisch',
      'nudeln', 'reis', 'brot', 'ei', 'eier', 'beeren', 'nüsse', 'mandeln', 'kerne', 'samen', 'flocken',
      'saft', 'wein', 'essig', 'wasser', 'brühe', 'fond', 'sauce', 'soße', 'creme', 'quark', 'joghurt',
      'sirup', 'pulver', 'gewürz', 'kraut', 'kräuter', 'schokolade', 'kakao', 'honig', 'senf', 'ketchup', 'mayonnaise',
      'zwiebel', 'knoblauch', 'tomate', 'kartoffel', 'paprika', 'möhre', 'karotte', 'gurke', 'zucchini', 'kürbis',
      'schinken', 'speck', 'hack', 'filet', 'brust', 'keule', 'hirse', 'quinoa', 'couscous', 'bulgur', 'polenta', 'grieß', 'hafer', 'dinkel',
      'zitrone', 'orange', 'limette', 'beere', 'apfel', 'birne', 'pfirsich', 'kirsche'
    ];

    // Suffixes to strip to find the stem (Stemming Match)
    // "Knoblauchzehen" -> strip "zehen" -> match "Knoblauch" in text
    const compoundSuffixes = [
      'zehe', 'zehen', 'stange', 'stangen', 'filet', 'filets', 'brust', 'keule', 'schenkel', 
      'würfel', 'scheiben', 'streifen', 'stücke', 'röschen', 'blättchen', 'hälften', 'enden',
      'knolle', 'knollen', 'schote', 'schoten'
    ];

    // Semantic Aliases (Concept Match)
    // "Tagliatelle" -> also match "Nudeln" or "Pasta"
    const categoryAliases: Record<string, string[]> = {
      'tagliatelle': ['nudeln', 'pasta'],
      'spaghetti': ['nudeln', 'pasta'],
      'penne': ['nudeln', 'pasta'],
      'fusilli': ['nudeln', 'pasta'],
      'rigatoni': ['nudeln', 'pasta'],
      'farfalle': ['nudeln', 'pasta'],
      'makkaroni': ['nudeln', 'pasta'],
      'tortellini': ['nudeln', 'pasta'],
      'linguine': ['nudeln', 'pasta'],
      'gnocchi': ['nudeln', 'gnocchis'],
      'lasagneplatten': ['nodeln', 'pasta', 'lasagne'],
      'basmatireis': ['reis'],
      'jasminreis': ['reis'],
      'risottoreis': ['reis'],
      'milchreis': ['reis'],
      'wildreis': ['reis'],
      'kartoffeln': ['kartoffel'],
      'champignons': ['pilze', 'champinons'],
      'zwiebeln': ['zwiebel'],
      'frühlingszwiebeln': ['zwiebel', 'zwiebeln'],
      'parmesan': ['käse'],
      'gouda': ['käse'],
      'mozzarella': ['käse'],
      'feta': ['käse', 'schafskäse'],
      'cheddar': ['käse'],
      'sahne': ['rahn'],
      'schmand': ['sahne', 'creme'],
      'crème fraîche': ['sahne', 'creme'],
      'hackfleisch': ['hack', 'fleisch'],
      'rinderhack': ['hack', 'fleisch', 'rind'],
    };

    const ingredientKeywords: { keyword: string; originalIndex: number }[] = [];

    // 2. Build Keyword List
    ingredients.forEach((ing, idx) => {
      const cleanName = ing.name.replace(/[0-9().,]/g, ' ');
      const words = cleanName.split(/\s+/);

      words.forEach(word => {
        const lower = word.toLowerCase().trim();
        
        // Basic Length Filter & Stop Words
        if (lower.length >= 2 && !stopWords.includes(lower)) {
          // A. Add original word (Default)
          ingredientKeywords.push({ keyword: word, originalIndex: idx });

          // B. Check Common Base Ingredients (Suffix Match: "Olivenöl" -> "Öl")
          for (const base of commonBaseIngredients) {
            if (lower.endsWith(base) && lower !== base) {
              const capitalizedBase = base.charAt(0).toUpperCase() + base.slice(1);
              ingredientKeywords.push({ keyword: capitalizedBase, originalIndex: idx });
            }
            // Also check if the word *contains* the base (e.g. "Rinderhack" contains "hack", "Kalbsfleisch" contains "fleisch")
            // This is safer now with expanded list
             if (lower.includes(base) && lower !== base && base.length > 2) {
               const capitalizedBase = base.charAt(0).toUpperCase() + base.slice(1);
               ingredientKeywords.push({ keyword: capitalizedBase, originalIndex: idx });
            }
          }

          // C. Check Compound Suffixes (Stemming: "Knoblauchzehen" -> "Knoblauch")
          for (const suffix of compoundSuffixes) {
            if (lower.endsWith(suffix) && lower.length > suffix.length) {
              const stem = lower.substring(0, lower.length - suffix.length);
              // Only add stem if it's substantial
              if (stem.length > 2) {
                 // Capitalize stem
                 const capitalizedStem = stem.charAt(0).toUpperCase() + stem.slice(1);
                 ingredientKeywords.push({ keyword: capitalizedStem, originalIndex: idx });
              }
            }
          }

          // D. Check Aliases (Semantic: "Tagliatelle" -> "Nudeln")
          if (categoryAliases[lower]) {
            categoryAliases[lower].forEach(alias => {
               const capitalizedAlias = alias.charAt(0).toUpperCase() + alias.slice(1);
               ingredientKeywords.push({ keyword: capitalizedAlias, originalIndex: idx });
            });
          }
        }
      });
    });

    // 3. Deduplicate keywords per index (optimization)
    const uniqueKeywords: { keyword: string; originalIndex: number }[] = [];
    const seen = new Set<string>();
    ingredientKeywords.forEach(k => {
      const key = `${k.keyword.toLowerCase()}-${k.originalIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueKeywords.push(k);
      }
    });

    // 4. Sort by length desc to match longest words first (Greedy Match)
    uniqueKeywords.sort((a, b) => b.keyword.length - a.keyword.length);

    // 5. Iterative Replacement
    let parts: (string | React.ReactNode)[] = [text];

    uniqueKeywords.forEach(({ keyword, originalIndex }) => {
      const newParts: (string | React.ReactNode)[] = [];

      parts.forEach(part => {
        if (typeof part === 'string') {
          const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Match word boundary or start of string
          const wordChar = '[a-zA-Z0-9_\\u00C0-\\u00FF]';
          const regex = new RegExp(`(?<!${wordChar})(${escapedKeyword}${wordChar}*)`, 'gi');

          const split = part.split(regex);
          
          split.forEach((segment, segIndex) => {
            if (segment.toLowerCase().startsWith(keyword.toLowerCase())) {
              // Safety Clean Check: Don't highlight stop words that accidentally matched
              if (stopWords.includes(segment.toLowerCase())) {
                newParts.push(segment);
                return;
              }

              const isHighlighted = highlightedIndex === originalIndex;

              newParts.push(
                <span
                  key={`${keyword}-${originalIndex}-${segIndex}`} // Stable key
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onToggleHighlight) onToggleHighlight(originalIndex);
                  }}
                  className={`
                    px-1.5 py-0.5 rounded-full text-sm font-medium mx-0.5 shadow-sm inline-block my-0.5 transition-all duration-200 cursor-pointer
                    ${getColorClass(originalIndex)} 
                    text-black dark:text-white 
                    ${isHighlighted 
                      ? 'ring-2 ring-offset-1 ring-black dark:ring-white scale-110 font-bold z-10 shadow-lg' 
                      : 'hover:scale-105 active:scale-95 opacity-90 hover:opacity-100'}
                  `}
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
