import type { Ingredient } from '../types';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type IngredientTextMatch = {
  start: number;
  end: number;
  ingredientIndex: number;
};

export const createKeywordPattern = (keyword: string) => {
  const words = keyword.trim().split(/\s+/);

  return words.map((word, index) => {
    if (index === words.length - 1) return escapeRegex(word);
    const stem = word.replace(/(?:em|en|er|es|e)$/i, '');
    return stem.length >= 3
      ? `${escapeRegex(stem)}(?:e|em|en|er|es)?`
      : escapeRegex(word);
  }).join('\\s+');
};

const WORD_CHAR = 'a-zA-Z0-9_\\u00C0-\\u00FF';
// Short keywords like "ei" or "öl" only take inflection endings, so "Ei" no
// longer swallows "eine" or "Eimasse"; longer ones still cover compounds.
// No "s": "Ei" must not take "Eis".
const SHORT_KEYWORD_SUFFIX = '(?:e|en|er|ern|es)?';
const SHORT_KEYWORD_MAX_LENGTH = 3;

export const createIngredientTextPattern = (keywords: string[]) => {
  if (!keywords.length) return null;
  const alternatives = keywords
    .map((keyword) => {
      const suffix = keyword.trim().length <= SHORT_KEYWORD_MAX_LENGTH
        ? SHORT_KEYWORD_SUFFIX
        : `[${WORD_CHAR}]*`;
      return `(${createKeywordPattern(keyword)})${suffix}`;
    })
    .join('|');
  return new RegExp(`(?<![${WORD_CHAR}])(?:${alternatives})(?![${WORD_CHAR}])`, 'gi');
};

export const mergeAdjacentIngredientMatches = (
  text: string,
  matches: IngredientTextMatch[],
) => matches.reduce<IngredientTextMatch[]>((merged, match) => {
  const previous = merged.at(-1);
  if (
    previous
    && previous.ingredientIndex === match.ingredientIndex
    && /^[\s-]+$/.test(text.slice(previous.end, match.start))
  ) {
    previous.end = match.end;
  } else {
    merged.push({ ...match });
  }
  return merged;
}, []);

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

// Descriptors in multi-word names ("Rote Paprika", "Gehackte Tomaten") only count
// together with their noun; alone, "rote" or "gehackte" would mark other
// ingredients ("eine rote Zwiebel", "gehackte Petersilie").
const DESCRIPTOR_STEMS = new Set([
  'rot', 'grün', 'gelb', 'weiß', 'schwarz', 'braun', 'bunt', 'hell', 'dunkel',
  'gehackt', 'geschält', 'gerieben', 'gemahlen', 'getrocknet', 'gehobelt', 'gewürfelt',
  'geraspelt', 'gestückelt', 'geräuchert', 'geröstet', 'gesalzen', 'ungesalzen',
  'gekocht', 'gefroren', 'tiefgekühlt', 'passiert', 'stückig', 'gemischt',
  'frisch', 'fein', 'grob', 'roh', 'reif', 'weich', 'jung', 'alt', 'groß', 'klein',
  'mittelgroß', 'edelsüß', 'rosenscharf', 'scharf', 'mild', 'süß', 'sauer',
  'glatt', 'kraus', 'vegan', 'flüssig', 'fettarm', 'halbfett', 'vollfett',
  'festkochend', 'mehligkochend', 'griechisch', 'italienisch',
]);
const isDescriptor = (word: string) => {
  const lower = word.toLowerCase();
  return DESCRIPTOR_STEMS.has(lower) || DESCRIPTOR_STEMS.has(lower.replace(/(?:em|en|er|es|e)$/, ''));
};

export type Keyword = { keyword: string; ingredientIndex: number };

const addKeyword = (map: Map<string, number>, value: string, ingredientIndex: number) => {
  const keyword = value.trim().toLowerCase();
  if (keyword.length >= 2 && !STOP_WORDS.has(keyword) && !map.has(keyword)) {
    map.set(keyword, ingredientIndex);
  }
};

export const buildKeywords = (ingredients: Ingredient[]): Keyword[] => {
  const keywords = new Map<string, number>();

  ingredients.forEach((ingredient, ingredientIndex) => {
    // Bracketed notes like "Ei(er)" or "(glatte)" would otherwise turn "er"
    // or "glatt" into keywords that match unrelated words in the steps.
    const cleanName = ingredient.name.replace(/\([^)]*\)/g, ' ').replace(/[0-9().,]/g, ' ').trim();
    const words = cleanName.split(/\s+/);
    addKeyword(keywords, cleanName, ingredientIndex);
    addKeyword(
      keywords,
      words.filter((word) => !STOP_WORDS.has(word.toLowerCase())).join(' '),
      ingredientIndex,
    );

    for (const word of words) {
      if (words.length > 1 && isDescriptor(word)) continue;
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
    .map(([keyword, ingredientIndex]) => ({ keyword, ingredientIndex }))
    .sort((a, b) => b.keyword.length - a.keyword.length);
};
