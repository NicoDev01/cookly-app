import React, { useMemo } from 'react';
import { Instruction, Ingredient } from '../../../types';
import { sanitizeMaterialSymbolName } from '../../../utils/iconUtils';
import {
  buildKeywords,
  createIngredientTextPattern,
  mergeAdjacentIngredientMatches,
  type IngredientTextMatch,
} from '../../../utils/ingredientKeywordPattern';

interface InstructionsProps {
  instructions: Instruction[];
  ingredients?: Ingredient[];
  highlightedIndex?: number | null;
  onToggleHighlight?: (index: number) => void;
}

const COLORS = [
  'bg-ingredient-1-bg', 'bg-ingredient-2-bg', 'bg-ingredient-3-bg',
  'bg-ingredient-4-bg', 'bg-ingredient-5-bg', 'bg-ingredient-6-bg',
  'bg-ingredient-7-bg', 'bg-ingredient-8-bg', 'bg-ingredient-9-bg',
  'bg-ingredient-10-bg',
];


const Instructions: React.FC<InstructionsProps> = ({
  instructions,
  ingredients = [],
  highlightedIndex,
  onToggleHighlight,
}) => {
  const keywords = useMemo(() => buildKeywords(ingredients), [ingredients]);
  const keywordPattern = useMemo(
    () => createIngredientTextPattern(keywords.map(({ keyword }) => keyword)),
    [keywords],
  );

  const renderText = (value: unknown) => {
    const text = typeof value === 'string' ? value : String(value ?? '');
    if (!keywordPattern) return text;

    const matches: IngredientTextMatch[] = [];
    const matcher = new RegExp(keywordPattern.source, keywordPattern.flags);
    for (const match of text.matchAll(matcher)) {
      const keywordIndex = match.slice(1).findIndex(Boolean);
      const ingredientIndex = keywords[keywordIndex]?.ingredientIndex;
      if (ingredientIndex !== undefined) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          ingredientIndex,
        });
      }
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const { start, end, ingredientIndex } of mergeAdjacentIngredientMatches(text, matches)) {
      const label = text.slice(start, end);
      const isHighlighted = highlightedIndex === ingredientIndex;
      const amount = ingredients[ingredientIndex]?.amount?.trim();
      if (start > lastIndex) parts.push(text.slice(lastIndex, start));
      parts.push(
        <button
          type="button"
          key={`${start}-${ingredientIndex}`}
          aria-expanded={isHighlighted}
          aria-label={`${label}${amount ? `, Menge ${amount}` : ''}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleHighlight?.(ingredientIndex);
          }}
          className="relative inline-flex items-center mx-0.5 align-baseline touch-manipulation after:absolute after:-inset-y-2 after:inset-x-0"
        >
          <span
            className={`px-1.5 py-px rounded-full text-sm font-medium shadow-sm inline-block transition-colors duration-200
              ${COLORS[ingredientIndex % COLORS.length]} text-black dark:text-white
              ${isHighlighted
              ? 'ring-1 ring-black/25 dark:ring-white/30 opacity-100'
              : 'opacity-90 hover:opacity-100'}`}
          >
            {label}{isHighlighted && amount ? ` ${amount}` : ''}
          </span>
        </button>,
      );
      lastIndex = end;
    }

    if (!parts.length) return text;
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  };

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4 text-[#111718] dark:text-white">Zubereitung</h2>
      <ol className="space-y-4 text-gray-800 dark:text-gray-200">
        {instructions.map((step, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="material-symbols-outlined !text-xl !leading-tight text-gray-500 dark:text-gray-400 pt-0.5">
              {sanitizeMaterialSymbolName(step?.icon) || 'circle'}
            </span>
            <span className="leading-relaxed">{renderText(step?.text)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default Instructions;
