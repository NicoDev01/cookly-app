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
