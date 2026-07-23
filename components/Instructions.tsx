import React, { useMemo } from 'react';
import { Instruction, Ingredient } from '../types';
import { sanitizeMaterialSymbolName } from '../utils/iconUtils';
import {
  createKeywordPattern,
  mergeAdjacentIngredientMatches,
  type IngredientTextMatch,
} from '../utils/ingredientKeywordPattern';

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

const STOP_WORDS = new Set([
  'g', 'kg', 'ml', 'l', 'el', 'tl', 'msp', 'prise', 'etwas', 'ca',
  'von', 'und', 'in', 'mit', 'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einer', 'eines', 'große', 'kleine', 'mittlere',
  'groß', 'klein', 'mittel', 'befreit', 'steinen', 'gewaschen', 'gehackt',
  'gewürfelt', 'scheiben', 'streifen', 'stücke', 'oder', 'anderes',
  'geschmacksneutrales', 'fein', 'grob', 'frisch', 'getrocknet', 'gemahlen',
  'warm', 'kalt', 'heiß', 'lauwarm', 'zum', 'für', 'bei', 'als', 'im',
  'aus', 'auf', 'nach', 'wahl', 'belieben', 'bedarf', 'garnieren',
  'servieren', 'z.b.', 'z.b', 'bsp.', 'bsp', 'evtl.', 'evtl', 'eventuell',
  'optional', 'dazu', 'darüber', 'daran', 'damit', 'davon', 'dabei', 'dafür',
  'darauf', 'darin', 'darunter', 'unter', 'über', 'durch', 'vor', 'hinter',
  'neben', 'zwischen', 'dose', 'dosen', 'glas', 'gläser', 'becher',
  'packung', 'päckchen', 'bund', 'stange', 'stangen', 'zehe', 'zehen',
]);

const BASE_INGREDIENTS = [
  'öl', 'mehl', 'zucker', 'salz', 'pfeffer', 'milch', 'sahne', 'käse',
  'wurst', 'fleisch', 'fisch', 'nudeln', 'reis', 'brot', 'ei', 'eier',
  'beeren', 'nüsse', 'mandeln', 'kerne', 'samen', 'schalen', 'flocken',
  'saft', 'wein', 'essig', 'wasser', 'brühe', 'fond', 'sauce', 'soße',
  'creme', 'quark', 'joghurt', 'sirup', 'pulver', 'gewürz', 'kraut',
  'kräuter', 'schokolade', 'kakao', 'honig', 'senf', 'ketchup', 'mayonnaise',
  'zwiebel', 'knoblauch', 'tomate', 'kartoffel', 'paprika', 'möhre',
  'karotte', 'gurke', 'zucchini', 'kürbis', 'schinken', 'speck', 'hack',
  'filet', 'brust', 'keule', 'hirse', 'quinoa', 'couscous', 'bulgur',
  'polenta', 'grieß', 'hafer', 'dinkel', 'zitrone', 'orange', 'limette',
  'beere', 'apfel', 'birne', 'pfirsich', 'kirsche', 'tofu', 'agar',
];

const COMPOUND_SUFFIXES = [
  'zehe', 'zehen', 'stange', 'stangen', 'filet', 'filets', 'brust', 'keule',
  'schenkel', 'würfel', 'scheiben', 'streifen', 'stücke', 'röschen',
  'blättchen', 'hälften', 'enden', 'knolle', 'knollen', 'schote', 'schoten',
  'kerne', 'samen', 'schalen',
];

const ALIASES: Record<string, string[]> = {
  tagliatelle: ['nudeln', 'pasta'],
  spaghetti: ['nudeln', 'pasta'],
  penne: ['nudeln', 'pasta'],
  fusilli: ['nudeln', 'pasta'],
  rigatoni: ['nudeln', 'pasta'],
  farfalle: ['nudeln', 'pasta'],
  makkaroni: ['nudeln', 'pasta'],
  tortellini: ['nudeln', 'pasta'],
  linguine: ['nudeln', 'pasta'],
  gnocchi: ['nudeln', 'gnocchis'],
  lasagneplatten: ['nudeln', 'pasta', 'lasagne'],
  basmatireis: ['reis'],
  jasminreis: ['reis'],
  risottoreis: ['reis'],
  milchreis: ['reis'],
  wildreis: ['reis'],
  kartoffeln: ['kartoffel'],
  champignons: ['pilze', 'champignons'],
  zwiebeln: ['zwiebel'],
  frühlingszwiebeln: ['zwiebel', 'zwiebeln'],
  parmesan: ['käse'],
  gouda: ['käse'],
  mozzarella: ['käse'],
  feta: ['käse', 'schafskäse'],
  cheddar: ['käse'],
  sahne: ['rahm'],
  schmand: ['sahne', 'creme'],
  'crème fraîche': ['sahne', 'creme'],
  hackfleisch: ['hack', 'fleisch'],
  rinderhack: ['hack', 'fleisch', 'rind'],
  seidentofu: ['tofu'],
  cashewkerne: ['cashew', 'kerne'],
  flohsamenschalen: ['flohsamen', 'schalen'],
  apfelessig: ['essig'],
  olivenöl: ['öl'],
  agaragar: ['agar'],
  'agar agar': ['agar'],
};

type Keyword = { keyword: string; pattern: string; ingredientIndex: number };

const addKeyword = (map: Map<string, number>, value: string, ingredientIndex: number) => {
  const keyword = value.trim().toLowerCase();
  if (keyword.length >= 2 && !STOP_WORDS.has(keyword) && !map.has(keyword)) {
    map.set(keyword, ingredientIndex);
  }
};

const buildKeywords = (ingredients: Ingredient[]): Keyword[] => {
  const keywords = new Map<string, number>();

  ingredients.forEach((ingredient, ingredientIndex) => {
    const cleanName = ingredient.name.replace(/[0-9().,]/g, ' ').trim();
    const words = cleanName.split(/\s+/);
    addKeyword(keywords, cleanName, ingredientIndex);
    addKeyword(
      keywords,
      words.filter((word) => !STOP_WORDS.has(word.toLowerCase())).join(' '),
      ingredientIndex,
    );

    for (const word of words) {
      const lower = word.toLowerCase();
      addKeyword(keywords, word, ingredientIndex);
      for (const base of BASE_INGREDIENTS) {
        if (lower !== base && (lower.endsWith(base) || (base.length > 2 && lower.includes(base)))) {
          addKeyword(keywords, base, ingredientIndex);
        }
      }
      for (const suffix of COMPOUND_SUFFIXES) {
        if (lower.endsWith(suffix) && lower.length - suffix.length > 2) {
          addKeyword(keywords, lower.slice(0, -suffix.length), ingredientIndex);
        }
      }
      for (const alias of ALIASES[lower] ?? []) addKeyword(keywords, alias, ingredientIndex);
      for (const suffix of ['e', 'en', 'er', 'es', 'n', 's', 'ern', 'nen']) {
        if (lower.endsWith(suffix) && lower.length - suffix.length >= 3) {
          addKeyword(keywords, lower.slice(0, -suffix.length), ingredientIndex);
        }
      }
    }
  });

  return [...keywords]
    .map(([keyword, ingredientIndex]) => ({
      keyword,
      pattern: createKeywordPattern(keyword),
      ingredientIndex,
    }))
    .sort((a, b) => b.keyword.length - a.keyword.length);
};

const Instructions: React.FC<InstructionsProps> = ({
  instructions,
  ingredients = [],
  highlightedIndex,
  onToggleHighlight,
}) => {
  const keywords = useMemo(() => buildKeywords(ingredients), [ingredients]);
  const keywordPattern = useMemo(() => {
    if (!keywords.length) return null;
    const alternatives = keywords
      .map(({ pattern }) => `(${pattern})[a-zA-Z0-9_\\u00C0-\\u00FF]*`)
      .join('|');
    return new RegExp(
      `(?<![a-zA-Z0-9_\\u00C0-\\u00FF])(?:${alternatives})(?![a-zA-Z0-9_\\u00C0-\\u00FF])`,
      'gi',
    );
  }, [keywords]);

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
