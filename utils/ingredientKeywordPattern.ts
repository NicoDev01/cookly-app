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
const SHORT_KEYWORD_SUFFIX = '(?:e|en|er|ern|es|s)?';
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
