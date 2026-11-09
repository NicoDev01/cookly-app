import { ALIASES } from './ingredientKeywordPattern.ts';

/**
 * Eine Suche für Titel, Kategorie und Zutaten.
 * Jedes Wort der Eingabe muss irgendwo vorkommen ("Tomate Feta").
 * Treffer im Titel stehen vorn; bei Zutaten-Treffern wird die Zutat mitgeliefert.
 * Findet die genaue Suche nichts, wird tippfehlertolerant gesucht ("Tomtae").
 */

export type SearchableRecipe = {
  title: string;
  category?: string;
  ingredients?: Array<{ name: string }>;
};

export type RecipeSearchMatch = {
  /** Höher = weiter oben. */
  score: number;
  /** Zutaten, über die das Rezept gefunden wurde (nur Wörter, die nicht im Titel stehen). */
  matchedIngredients: string[];
};

export type RecipeSearchResult<T> = {
  hits: Array<{ recipe: T; matchedIngredients: string[] }>;
  /** true: nichts genau gefunden, das sind tippfehlertolerante Treffer. */
  approximate: boolean;
  /** Bei 0 Treffern: eingegebene Wörter, die in keinem Rezept vorkommen. */
  unmatchedTerms: string[];
};

const MAX_MATCHED_INGREDIENTS = 3;

/** Kleinschreibung, Umlaute ausschreiben, Akzente weg: "Crème", "Käse" = "creme", "kaese". */
export const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const splitWords = (value: string) => normalizeSearchText(value).split(/[^a-z0-9]+/).filter(Boolean);

const QUERY_STOP_WORDS = new Set(['mit', 'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'in', 'im', 'vom', 'von']);

/** Wörter der Eingabe; Füllwörter wie "mit" fallen weg, solange noch etwas übrig bleibt. */
export const parseSearchQuery = (query: string): string[] => {
  const words = [...new Set(splitWords(query))];
  const meaningful = words.filter((word) => !QUERY_STOP_WORDS.has(word));
  return meaningful.length > 0 ? meaningful : words;
};

// "tomaten" findet auch "Tomate", "zwiebeln" auch "Zwiebel".
const PLURAL_STEM = /^(.{4,}?)(?:en|er|n|e|s)$/;
const tokenVariants = (token: string) => {
  const stem = token.match(PLURAL_STEM)?.[1];
  return stem ? [token, stem] : [token];
};

// Endungen, die ein Wort am Ende eines zusammengesetzten Worts haben darf: "Kirschtomaten", "Basmatireis".
const COMPOUND_ENDINGS = new Set(['', 'e', 'n', 'en', 'er', 'ern', 's', 'es', 'nen']);
// Kurze Wörter ("ei", "öl") nur mit Beugungsendung, sonst findet "ei" jedes "Eisbergsalat".
const SHORT_ENDINGS = new Set(['', 'e', 'er', 'ern', 'en', 'es']);

const wordMatchesLoosely = (variant: string, word: string) => {
  if (word.startsWith(variant)) return true;
  if (variant.length < 3) return false;
  const at = word.lastIndexOf(variant);
  return at > 0 && COMPOUND_ENDINGS.has(word.slice(at + variant.length));
};

const wordMatchesStrictly = (variant: string, word: string) =>
  variant.length > 2
    ? wordMatchesLoosely(variant, word)
    : word.startsWith(variant) && SHORT_ENDINGS.has(word.slice(variant.length));

/** Tippfehler-Abstand (vertauschte Nachbarn zählen als ein Fehler); bricht ab, sobald `max` überschritten ist. */
const editDistance = (a: string, b: string, max: number) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prev2[j - 2] + 1);
      row.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
};

const WORD_ENDING = /(?:en|er|n|e|s)$/;

// Ab 4 Buchstaben ein Tippfehler erlaubt, ab 8 zwei. Verglichen wird mit dem ganzen Wort,
// seinem Anfang (noch am Tippen) und seinem Ende ohne Pluralendung ("Kirschtomaten" → "tomat(e)").
const wordMatchesFuzzy = (token: string, word: string) => {
  if (token.length < 4) return false;
  const max = token.length >= 8 ? 2 : 1;
  // "Kirschtomaten" → "kirschtomat" und "kirschtomate" (nur das n weg).
  const bases = [word, word.replace(WORD_ENDING, ''), word.replace(/n$/, '')];
  const parts = [word.slice(0, token.length), ...bases, ...bases.map((base) => base.slice(-token.length))];
  return parts.some((part) => editDistance(token, part, max) <= max);
};

type MatchMode = 'exact' | 'fuzzy';

const matchesAnyWord = (token: string, words: string[], strict: boolean, mode: MatchMode) => {
  const match = strict ? wordMatchesStrictly : wordMatchesLoosely;
  if (tokenVariants(token).some((variant) => words.some((word) => match(variant, word)))) return true;
  return mode === 'fuzzy' && words.some((word) => wordMatchesFuzzy(token, word));
};

/** Wörter einer Zutat plus Oberbegriffe ("Spaghetti" → nudeln, pasta; "Feta" → käse). */
const ingredientWords = (name: string) => {
  const cleanName = name.replace(/\([^)]*\)/g, ' ');
  const lower = cleanName.toLowerCase().trim();
  const words = splitWords(cleanName);
  const aliases = [lower, ...lower.split(/\s+/)].flatMap((word) => ALIASES[word] ?? []);
  return [...new Set([...words, ...aliases.flatMap(splitWords)])];
};

type PreparedRecipe = {
  titleWords: string[];
  categoryWords: string[];
  normalizedTitle: string;
  ingredients: Array<{ name: string; words: string[] }>;
};

const prepareRecipe = (recipe: SearchableRecipe): PreparedRecipe => ({
  titleWords: splitWords(recipe.title),
  categoryWords: splitWords(recipe.category ?? ''),
  normalizedTitle: normalizeSearchText(recipe.title),
  ingredients: (recipe.ingredients ?? []).map((ingredient) => ({
    name: ingredient.name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(),
    words: ingredientWords(ingredient.name),
  })),
});

const matchPrepared = (tokens: string[], recipe: PreparedRecipe, mode: MatchMode): RecipeSearchMatch | null => {
  if (tokens.length === 0) return null;
  let titleHits = 0;
  let categoryHits = 0;
  const matched: string[] = [];
  for (const token of tokens) {
    if (matchesAnyWord(token, recipe.titleWords, false, mode)) {
      titleHits += 1;
      continue;
    }
    if (matchesAnyWord(token, recipe.categoryWords, false, mode)) {
      categoryHits += 1;
      continue;
    }
    const ingredient = recipe.ingredients.find((entry) => matchesAnyWord(token, entry.words, true, mode));
    if (!ingredient) return null;
    if (!matched.includes(ingredient.name)) matched.push(ingredient.name);
  }

  const startsWithQuery = recipe.normalizedTitle.startsWith(tokens[0]) ? 1 : 0;
  return {
    score: (titleHits === tokens.length ? 100 : 0) + titleHits * 10 + categoryHits * 3 + startsWithQuery,
    matchedIngredients: matched.slice(0, MAX_MATCHED_INGREDIENTS),
  };
};

/** Bewertet ein Rezept; `null`, wenn nicht jedes Suchwort vorkommt. */
export const matchRecipe = (tokens: string[], recipe: SearchableRecipe, mode: MatchMode = 'exact') =>
  matchPrepared(tokens, prepareRecipe(recipe), mode);

const rank = <T>(recipes: T[], prepared: PreparedRecipe[], tokens: string[], mode: MatchMode) =>
  recipes
    .map((recipe, order) => ({ recipe, order, match: matchPrepared(tokens, prepared[order], mode) }))
    .filter((entry): entry is { recipe: T; order: number; match: RecipeSearchMatch } => entry.match !== null)
    .sort((a, b) => b.match.score - a.match.score || a.order - b.order)
    .map(({ recipe, match }) => ({ recipe, matchedIngredients: match.matchedIngredients }));

/**
 * Treffer sortiert: alles im Titel zuerst, dann teils im Titel/Kategorie, dann nur Zutaten.
 * Ohne genaue Treffer: tippfehlertolerant. Ohne jeden Treffer: welche Wörter nirgends vorkommen.
 */
export const searchRecipes = <T extends SearchableRecipe>(recipes: T[], query: string): RecipeSearchResult<T> => {
  const tokens = parseSearchQuery(query);
  if (tokens.length === 0) return { hits: [], approximate: false, unmatchedTerms: [] };
  const prepared = recipes.map(prepareRecipe);

  const exact = rank(recipes, prepared, tokens, 'exact');
  if (exact.length > 0) return { hits: exact, approximate: false, unmatchedTerms: [] };

  const fuzzy = rank(recipes, prepared, tokens, 'fuzzy');
  if (fuzzy.length > 0) return { hits: fuzzy, approximate: true, unmatchedTerms: [] };

  // Wörter so zurückgeben, wie sie eingegeben wurden ("Trüffel", nicht "trueffel").
  const unmatchedTerms = query
    .split(/[\s,;]+/)
    .filter((term) => {
      const termTokens = parseSearchQuery(term).filter((token) => tokens.includes(token));
      return termTokens.length > 0
        && termTokens.some((token) => !prepared.some((recipe) => matchPrepared([token], recipe, 'fuzzy')));
    });
  return { hits: [], approximate: false, unmatchedTerms: [...new Set(unmatchedTerms)] };
};
