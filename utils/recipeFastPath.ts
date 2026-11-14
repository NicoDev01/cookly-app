/**
 * Schnellweg für den Website-Import: Das schema.org-Rezept (JSON-LD) der Seite wird per Regeln auf Cookly
 * abgebildet, ohne Gemini. Gemini bleibt zuständig, sobald eine Prüfung in `issues` anschlägt
 * (fremde Sprache, Kategorie unklar, Textblock statt Schritte …). `recipe` ist dann trotzdem gesetzt,
 * wenn das Rezept wenigstens vollständig ist: Ersatz, falls Gemini ausfällt.
 */
import { cleanText, type SchemaRecipe } from './recipeJsonLd.ts';

export type FastRecipe = {
  title: string;
  category: string;
  prepTimeMinutes: number;
  difficulty: 'Einfach' | 'Mittel' | 'Schwer';
  portions: number;
  ingredients: Array<{ name: string; amount: string }>;
  instructions: Array<{ text: string; icon: string }>;
};

export type FastPathResult = { recipe: FastRecipe | null; issues: string[] };

const L = String.raw`\p{L}`;
const fold = (value: string) => value.toLowerCase().normalize('NFC');

// ---------------------------------------------------------------- Titel

const MARKETING = /(lecker|einfach|schnell|saftig|cremig|knusprig|zart|wie bei oma|beste|perfekt|gelingsicher|grundrezept|blitzrezept|original|klassisch)/i;

export const cleanTitle = (title: string, author: string) => {
  let result = cleanText(title);
  if (author) {
    const suffix = ` von ${author}`.toLowerCase();
    if (result.toLowerCase().endsWith(suffix)) result = result.slice(0, -suffix.length);
  }
  result = result
    .replace(/^Rezept:\s*/i, '')
    .replace(/\s*:\s*Rezepte?\b.*$/i, '')
    .replace(/\s*[-–|]?\s+Rezepte?$/i, '')
    // Werbe-Anhängsel: "Gulasch – zart, einfach & lecker", "Wildschwein-Gulasch, einfach"
    .replace(/\s+[-–|]\s+[^–|]{0,60}$/u, (tail) => (MARKETING.test(tail) ? '' : tail))
    .replace(/,\s*[^,]{0,25}$/u, (tail) => (MARKETING.test(tail) ? '' : tail))
    .trim();
  return result || cleanText(title);
};

const titleTokens = (value: string) =>
  new Set(fold(value).split(new RegExp(`[^${L}]+`, 'u')).filter((word) => word.length >= 4));

/** Rezeptname und Seitentitel teilen mindestens ein Wort. Sonst steckt evtl. ein Fremd-Rezept im Markup. */
const matchesPage = (title: string, pageTitle: string) => {
  if (!pageTitle) return true;
  const page = titleTokens(pageTitle);
  const own = [...titleTokens(title)];
  return own.length === 0 || own.some((word) => page.has(word));
};

// ---------------------------------------------------------------- Sprache

const GERMAN_WORDS = /(?<![\p{L}])(und|die|der|das|mit|den|dem|ein|eine|auf|für|nach|bis|etwas|minuten|zugeben|geben|lassen)(?![\p{L}])/giu;
const ENGLISH_WORDS = /(?<![\p{L}])(the|and|with|until|into|minutes|add|stir|for|of|cup|cups)(?![\p{L}])/giu;

const isGerman = (recipe: SchemaRecipe) => {
  if (recipe.language) return /^de\b/i.test(recipe.language);
  const sample = [...recipe.ingredients, ...recipe.steps.map((step) => step.text)].join(' ');
  const de = sample.match(GERMAN_WORDS)?.length ?? 0;
  const en = sample.match(ENGLISH_WORDS)?.length ?? 0;
  return de > en;
};

// ---------------------------------------------------------------- Zutaten

const NUM = String.raw`(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d*\s?[½¼¾⅓⅔⅛]|\d+(?:[.,]\d+)?)`;
const AMOUNT = new RegExp(String.raw`^((?:ca\.?|circa|etwa|je)\s+)?(${NUM})(\s*(?:-|–|bis)\s*${NUM})?\s*`, 'i');
const UNITS = new Set([
  'g', 'gr', 'gr.', 'kg', 'mg', 'ml', 'l', 'cl', 'dl', 'el', 'tl', 'msp', 'msp.', 'prise', 'prisen', 'pck', 'pck.',
  'pkt', 'pkt.', 'päckchen', 'packung', 'packungen', 'beutel', 'becher', 'dose', 'dosen', 'glas', 'gläser',
  'flasche', 'flaschen', 'bund', 'stk', 'stk.', 'stück', 'scheibe', 'scheiben', 'zehe', 'zehen', 'tasse', 'tassen',
  'handvoll', 'zweig', 'zweige', 'stange', 'stangen', 'blatt', 'blätter', 'kugel', 'kugeln', 'würfel', 'liter',
  'gramm', 'kilogramm', 'esslöffel', 'teelöffel', 'spritzer', 'schuss', 'tropfen', 'tüte', 'tüten', 'rolle',
  'rollen', 'platte', 'platten', 'kopf', 'köpfe', 'knolle', 'knollen', 'stiel', 'stiele', 'messerspitze',
  'messerspitzen', 'schale', 'schalen', 'netz', 'paar', 'portion', 'portionen',
]);
const UNIT_PREFIX = /^(gestr\.|gestrichene?[rn]?|gehäufte?[rn]?|knapp|gut|leicht)\s+/i;
const NO_AMOUNT_WORDS = /^(etwas|wenig|reichlich|evtl\.?|eventuell|n\.\s?b\.|nach belieben|optional)\s+/i;
/** Chefkoch-Schreibweise "Zwiebel(n)", "Stange/n": Endung nur bei Mehrzahl anhängen. */
const PLURAL_HINT = new RegExp(`([${L}])(?:\\((n|en|e|s|er|nen)\\)|/(n|en|e|s)(?![${L}]))`, 'gu');
/** Zwischenüberschriften in der Zutatenliste ("Für den Teig:") sind keine Zutaten. */
const INGREDIENT_HEADER = /^[^\d]{1,50}:$/;

const firstNumber = (value: string) => {
  const raw = value.match(new RegExp(NUM))?.[0]?.trim() ?? '';
  if (/[½¼¾⅓⅔⅛]|\//.test(raw)) return Number(raw.match(/^\d+/)?.[0] ?? 0) + 0.5;
  return Number(raw.replace(',', '.')) || 0;
};

export const splitIngredient = (line: string): { name: string; amount: string } => {
  const text = cleanText(line).replace(/^[-•*–]\s*/, '');
  let amount = '';
  let rest = text;

  const match = text.match(AMOUNT);
  if (match) {
    amount = match[0].trim();
    rest = text.slice(match[0].length);
    const prefix = rest.match(UNIT_PREFIX)?.[0] ?? '';
    const unit = rest.slice(prefix.length).match(/^(\S+)\s*/);
    const unitWord = unit?.[1].replace(PLURAL_HINT, '$1').toLowerCase();
    if (unit && unitWord && UNITS.has(unitWord) && rest.length > prefix.length + unit[0].length) {
      amount = `${amount} ${prefix}${unit[1]}`;
      rest = rest.slice(prefix.length + unit[0].length);
    }
  } else {
    const word = text.match(NO_AMOUNT_WORDS);
    if (word) {
      amount = word[1];
      rest = text.slice(word[0].length);
    }
  }

  const plural = firstNumber(amount) > 1;
  const resolve = (value: string) =>
    value.replace(PLURAL_HINT, (_match, letter: string, paren?: string, slash?: string) =>
      letter + (plural ? paren ?? slash ?? '' : ''));
  return {
    amount: resolve(amount).replace(/(\d)\.(\d{1,2})(?!\d)/g, '$1,$2').replace(/\s+/g, ' ').trim(),
    name: resolve(rest).replace(/^[,;:\s]+|[,;\s]+$/g, '').replace(/\s+/g, ' ').trim(),
  };
};

// ---------------------------------------------------------------- Schritte

const GENERIC_SECTION = /^(zubereitung|anleitung|instructions?|directions?|method|schritte?|preparation|so geht'?s)$/i;
const MAX_STEP_CHARS = 1_200;

const ICON_RULES: Array<[string, RegExp]> = [
  ['oven_gen', /ofen|backen|überbacken|gratinier|umluft|ober-?\s?\/?\s?unterhitze|°c|grad/i],
  ['outdoor_grill', /grill/i],
  ['microwave', /mikrowelle/i],
  ['blender', /mixer|mixen|gemixt|shaker|pürier|zerkleiner|stabmixer|blender|aufschlagen/i],
  ['skillet', /pfanne|anbrat|braten|brate|brät|rösten|röste|frittier/i],
  ['soup_kitchen', /topf|kochen|koch|köchel|aufkoch|sieden|garen|brühe|dünst/i],
  ['bakery_dining', /teig|knet|ausroll/i],
  ['egg', /(?<![\p{L}])eier?(?![\p{L}])|eigelb|eiweiß|verquirl/iu],
  ['timer', /ruhen|ziehen lassen|abkühl|kühlschrank|kalt stellen|quellen|gehen lassen|marinier/i],
  ['restaurant', /servier|anricht|garnier|bestreu|genießen|guten appetit/i],
  ['kitchen', /schneid|würfel|hack|schäl|reib|halbier|vierteln/i],
  ['water_drop', /wasch|abspül|abtropf/i],
];

const iconFor = (text: string) => ICON_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'flatware';

/** Ein einziger langer Textblock wird an Satzgrenzen in Schritte von etwa 2–3 Sätzen zerlegt. */
const splitBlock = (text: string): string[] => {
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const steps: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > 280) {
      steps.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) steps.push(current);
  return steps;
};

const buildInstructions = (recipe: SchemaRecipe) => {
  let section: string | undefined;
  const texts = recipe.steps.flatMap((step) => {
    let text = step.text.replace(/^(?:schritt\s*)?\d+[.):]\s*/i, '').trim();
    // Seitenhinweise wie "*Hinweis: Schau dir das Rezept-Video an" sind keine Arbeitsschritte.
    if (!text || /^\*|^(hinweis|anmerkung|note)\s*:/i.test(text)) return [];
    // Nur kurze, echte Abschnittsnamen ("Teig", "Für die Soße") voranstellen; manche Seiten tragen dort Hinweise ein.
    const named = step.section && step.section.length <= 40 && !GENERIC_SECTION.test(step.section) && !/^\*|hinweis|video/i.test(step.section);
    if (named && step.section !== section) {
      if (!text.toLowerCase().startsWith(step.section!.toLowerCase())) text = `${step.section}: ${text}`;
    }
    section = step.section;
    return [text];
  });
  const steps = texts.length === 1 && texts[0].length > 400 ? splitBlock(texts[0]) : texts;
  return steps.map((text) => ({ text, icon: iconFor(text) }));
};

// ---------------------------------------------------------------- Zeit, Portionen, Schwierigkeit

const durationMinutes = (value: string) => {
  if (!value) return 0;
  const iso = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+)S)?)?$/i);
  if (iso) return Math.round(Number(iso[1] ?? 0) * 1440 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0) + Number(iso[4] ?? 0) / 60);
  const hours = Number(value.match(/(\d+)\s*(?:std|stunde|h\b)/i)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+)\s*min/i)?.[1] ?? 0);
  return hours * 60 + minutes;
};

const totalMinutes = (recipe: SchemaRecipe, stepCount: number) => {
  const total = durationMinutes(recipe.totalTime) || durationMinutes(recipe.prepTime) + durationMinutes(recipe.cookTime);
  if (total > 0 && total <= 4_320) return total;
  // Grobe Schätzung wie bei Gemini, wenn die Seite keine Zeit nennt.
  return Math.min(90, Math.max(15, Math.round((10 + stepCount * 8) / 5) * 5));
};

const portionsFrom = (yields: string[]) => {
  for (const value of yields) {
    const number = Number(value.match(/\d+/)?.[0]);
    if (number >= 1 && number <= 100) return number;
  }
  return 4;
};

/**
 * Angabe der Seite, sonst nach Arbeitsaufwand (Schritte, Zutaten). Die Gesamtzeit zählt nicht,
 * weil sie Ruhe- und Backzeit enthält. Im Vergleich mit Gemini (Nov. 2026) ähnlich mild abgestimmt.
 */
const difficultyFrom = (recipe: SchemaRecipe, stepCount: number): FastRecipe['difficulty'] => {
  const meta = fold([...recipe.keywords, ...recipe.categories].join(' '));
  if (/(?<![\p{L}])(simpel|einfach|leicht|easy)(?![\p{L}])/u.test(meta)) return 'Einfach';
  if (/(?<![\p{L}])(pfiffig|schwer|anspruchsvoll|aufwendig|aufwändig|hard|difficult)(?![\p{L}])/u.test(meta)) return 'Schwer';
  if (/(?<![\p{L}])(normal|mittel|medium)(?![\p{L}])/u.test(meta)) return 'Mittel';
  const ingredients = recipe.ingredients.length;
  if (stepCount > 12 && ingredients > 15) return 'Schwer';
  if (stepCount > 7 || ingredients > 15) return 'Mittel';
  return 'Einfach';
};

// ---------------------------------------------------------------- Kategorie

/** Ganzes Wort. */
const w = (word: string) => `(?<![${L}])${word}(?![${L}])`;
/** Wortanfang oder -ende: "Rindergulasch", "Räucherspeck", aber nicht "grinding" oder "speckled". */
const edge = (word: string) => `(?<![${L}])${word}|${word}(?![${L}])`;
const rule = (...parts: string[]) => new RegExp(parts.join('|'), 'iu');

/** Reihenfolge = Vorrang. Getestet auf dem Rezeptnamen, danach auf Kategorie/Keywords der Seite. */
const CATEGORY_RULES: Array<[string, RegExp]> = [
  ['Getränke', rule('cocktail', 'mocktail', 'smoothie', 'getränk', 'drink', 'limonade', 'bowle', 'punsch', 'glühwein', 'likör', 'milchshake', w('shake'), w('tee'), 'eistee', w('chai'), w('kaffee'), 'eiskaffee', 'cappuccino', w('latte'), w('kakao'), 'heiße schokolade', `saft(?![${L}])`)],
  ['Frühstück', rule('frühstück', 'porridge', 'overnight oats', 'müsli', 'granola', 'pancake', 'pfannkuchen', 'waffel', 'rührei', 'omelett', 'french toast', 'breakfast', 'brunch')],
  ['Dessert', rule('dessert', 'nachtisch', 'nachspeise', 'pudding', 'mousse', 'tiramisu', w('eis'), 'eiscreme', '(?:erdbeer|vanille|schoko|joghurt|bananen)eis', 'sorbet', 'parfait', 'panna cotta', 'crème brûlée', 'creme brulee', 'kompott', 'grütze', 'crumble', 'trifle')],
  ['Backen', rule('kuchen', 'torte', 'backen', 'gebäck', `brot(?![${L}])`, 'brötchen', 'plätzchen', 'keks', 'cookie', 'muffin', 'cupcake', 'brownie', 'cake', w('zopf'), 'stollen', 'strudel', 'tarte', 'quiche', 'pizza', 'baiser', `teig(?![${L}])`, 'teigtaschen', 'scones', 'croissant')],
  ['Vegan', rule('vegan')],
  ['Vegetarisch', rule('vegetari')],
  ['Salat', rule('salat', 'salad')],
  ['Suppe', rule('suppe', 'eintopf', 'brühe', 'soup', 'chili con', 'chili sin', 'ramen', w('pho'), 'bouillon', 'stew')],
  ['Pasta', rule('pasta', 'nudel', 'spaghetti', 'lasagne', 'penne', 'tagliatelle', 'fusilli', 'farfalle', 'makkaroni', 'maccheroni', 'rigatoni', 'tortellini', 'ravioli', 'gnocchi', 'spätzle', 'linguine', 'orecchiette', 'pappardelle', 'cannelloni', 'noodle', w('udon'))],
  ['Fisch', rule('fisch', 'lachs', 'thunfisch', 'forelle', 'kabeljau', 'seelachs', 'garnele', 'shrimp', 'scampi', 'meeresfrüchte', 'muschel', 'tintenfisch', 'calamar', 'dorade', 'zander', 'hering', 'sardine', 'makrele', 'krabbe', 'hummer', 'salmon', w('fish'))],
  ['Fleisch', rule('fleisch', edge('rind'), 'schwein', 'hähnchen', 'hühnchen', w('huhn'), 'hühner', edge('pute'), 'truthahn', 'hackbraten', w('hack'), 'gyros', 'steak', 'schnitzel', `braten(?![${L}])`, 'gulasch', 'wurst', 'würstchen', edge('speck'), 'schinken', 'bacon', edge('lamm'), w('ente'), 'entenbrust', `gans(?![${L}])`, 'gänse', 'wildschwein', w('reh'), 'rehrücken', 'hirsch', edge('kalb'), 'frikadelle', 'bulette', 'chicken', w('beef'), w('pork'), 'chorizo', 'salami', 'pancetta', 'guanciale', 'roulade', 'kassler', `filet(?![${L}])`)],
  ['Beilage', rule('beilage', 'side dish', 'kartoffelpüree', 'püree', 'bratkartoffeln', 'pommes', 'kroketten', 'knödel', 'klöße', 'rotkohl', 'sauerkraut', w('reis'), 'risotto', 'couscous', 'bulgur', 'ofengemüse', 'rahmgemüse')],
  ['Snack', rule('snack', 'fingerfood', 'häppchen', w('dip'), 'bruschetta', 'chips', 'nachos', w('wrap'), 'sandwich', w('toast'), 'flammkuchen', 'aufstrich', 'hummus', 'riegel')],
];

/** Für die Zutaten-Prüfung strenger: "Fischsauce" macht kein Fischgericht, "gehackt" kein Fleischgericht. */
const MEAT_INGREDIENT = rule('fleisch', edge('rind'), 'schwein', 'hähnchen', 'hühnchen', 'hühnerbrust', edge('pute'), w('hack'), 'gyros', 'steak', 'schnitzel', edge('speck'), 'schinken', 'bacon', edge('lamm'), 'chorizo', 'salami', 'pancetta', 'guanciale', 'wurst', 'würstchen', 'kassler', edge('kalb'), 'entenbrust', 'wildschwein', 'rehrücken', 'hirsch');
const FISH_INGREDIENT = rule('lachs', 'thunfisch', 'forelle', 'kabeljau', 'seelachs', 'garnele', 'shrimp', 'scampi', 'muschel', 'tintenfisch', 'calamar', 'dorade', 'zander', 'hering', 'sardine', 'makrele', 'krabbe', 'fischfilet', 'meeresfrüchte');

const matchCategory = (text: string) => CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0];

export const categoryFor = (recipe: SchemaRecipe, title: string): string | undefined => {
  const meta = fold([...recipe.categories, ...recipe.keywords].join(', '));
  const diets = fold([...recipe.diets, ...recipe.keywords].join(' '));
  const ingredients = recipe.ingredients.map(fold).filter((line) => !/fischsauce|fischfond|austernsauce/.test(line));
  return matchCategory(fold(title))
    ?? matchCategory(meta)
    ?? (/vegan/.test(diets) ? 'Vegan' : /vegetari/.test(diets) ? 'Vegetarisch' : undefined)
    ?? (ingredients.some((line) => FISH_INGREDIENT.test(line)) ? 'Fisch' : undefined)
    ?? (ingredients.some((line) => MEAT_INGREDIENT.test(line)) ? 'Fleisch' : undefined);
};

// ---------------------------------------------------------------- Zusammenbau

export const buildFastRecipe = (schema: SchemaRecipe): FastPathResult => {
  const issues: string[] = [];
  const title = cleanTitle(schema.title, schema.author);
  const ingredients = schema.ingredients
    .filter((line) => !INGREDIENT_HEADER.test(cleanText(line)))
    .map(splitIngredient)
    .filter((item) => item.name);
  const instructions = buildInstructions(schema);

  if (ingredients.length < 2) issues.push('too_few_ingredients');
  if (!instructions.length) issues.push('no_steps');
  if (!title) issues.push('no_title');
  if (issues.length) return { recipe: null, issues };

  if (!matchesPage(title, schema.pageTitle)) return { recipe: null, issues: ['title_mismatch'] };
  if (!isGerman(schema)) issues.push('not_german');
  if (ingredients.length > 60 || ingredients.some((item) => item.name.length > 120)) issues.push('ingredient_noise');
  if (instructions.some((step) => step.text.length > MAX_STEP_CHARS || /<\w|https?:\/\//.test(step.text))) issues.push('step_noise');

  const category = categoryFor(schema, title);
  if (!category) issues.push('category_unknown');

  const minutes = totalMinutes(schema, instructions.length);
  return {
    issues,
    recipe: {
      title,
      category: category ?? 'Sonstiges',
      prepTimeMinutes: minutes,
      difficulty: difficultyFrom(schema, instructions.length),
      portions: portionsFrom(schema.yields),
      ingredients,
      instructions,
    },
  };
};
