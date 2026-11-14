/**
 * Liest das schema.org-Rezept (JSON-LD) aus dem HTML einer Rezeptseite. Fast alle großen Rezeptseiten
 * und Blog-Plugins liefern es für Google mit. Ergebnis ist ein kurzer Markdown-Text für Gemini statt der
 * ganzen Seite: schneller und günstiger als Jina plus 50k Zeichen Markdown.
 */
export type PageRecipe = {
  title: string;
  image?: string;
  content: string;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: Json | undefined): Json[] => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', deg: '°', frac12: '½', frac14: '¼', frac34: '¾',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
};

/** HTML-Entities auflösen, Tags entfernen, Leerraum zusammenfassen. */
export const cleanText = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, code: string) => {
      const point = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : code.startsWith('#') ? parseInt(code.slice(1), 10) : NaN;
      // Kaputte Nummern wie &#99999999; würden fromCodePoint werfen und den ganzen Import abbrechen.
      if (code.startsWith('#')) return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
      return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();

const text = (value: Json | undefined): string => {
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'number') return String(value);
  if (isObject(value)) return text(value.text ?? value.name ?? value['@value']);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  return '';
};

const hasType = (node: JsonObject, type: string) =>
  asArray(node['@type']).some((t) => typeof t === 'string' && (t === type || t.endsWith(`/${type}`)));

/** Alle Objekte im JSON-LD, auch in @graph und verschachtelten Listen. */
const collectNodes = (value: Json | undefined, out: JsonObject[] = [], depth = 0): JsonObject[] => {
  if (depth > 6 || value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, out, depth + 1);
  } else if (isObject(value)) {
    out.push(value);
    if (value['@graph']) collectNodes(value['@graph'], out, depth + 1);
    if (value.mainEntity) collectNodes(value.mainEntity, out, depth + 1);
  }
  return out;
};

export type SchemaStep = { text: string; section?: string };

/** Schritte aus Text, HowToStep oder HowToSection (Überschrift wandert in `section`). */
const instructionSteps = (value: Json | undefined, section?: string, depth = 0): SchemaStep[] => {
  if (depth > 4) return [];
  if (typeof value === 'string') {
    return value.split(/\r?\n+/).map(cleanText).filter(Boolean).map((line) => ({ text: line, section }));
  }
  return asArray(value).flatMap((item) => {
    if (typeof item === 'string') return instructionSteps(item, section, depth + 1);
    if (!isObject(item)) return [];
    if (hasType(item, 'HowToSection') || item.itemListElement) {
      return instructionSteps(item.itemListElement, text(item.name) || section, depth + 1);
    }
    const line = text(item.text ?? item.name);
    return line ? [{ text: line, section }] : [];
  });
};

/** Markdown-Zeilen: Abschnittsüberschrift als **…**, sobald sie wechselt. */
const instructionLines = (steps: SchemaStep[]): string[] => {
  let current: string | undefined;
  return steps.flatMap((step) => {
    const header = step.section && step.section !== current ? [`**${step.section}**`] : [];
    current = step.section;
    return [...header, step.text];
  });
};

const imageUrl = (value: Json | undefined): string | undefined => {
  for (const item of asArray(value)) {
    const url = typeof item === 'string' ? item : isObject(item) ? item.url ?? item.contentUrl : undefined;
    if (typeof url === 'string' && /^https:\/\//i.test(url.trim())) return url.trim();
  }
  return undefined;
};

const metaContent = (html: string, property: string) => {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, 'i'))?.[0];
  const content = tag?.match(/content=["']([^"']+)["']/i)?.[1];
  return content ? cleanText(content) : undefined;
};

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, 'i'))?.[1];
const SKIP_IMAGE = /logo|avatar|gravatar|icon|emoji|sprite|badge|pinit|placeholder|\.svg(\?|$)/i;

/** Beste Bild-URL eines <img>: größte srcset-Variante bis 1600 px, sonst src ohne WordPress-Größenzusatz (-360x361). */
const bestImageSource = (tag: string): string | undefined => {
  const srcset = attr(tag, 'data-lazy-srcset') ?? attr(tag, 'data-srcset') ?? attr(tag, 'srcset');
  const candidates = (srcset ?? '').split(',').map((part) => {
    const [url, size] = part.trim().split(/\s+/);
    return { url, width: Number.parseInt(size ?? '', 10) || 0 };
  }).filter((item) => item.url && item.width <= 1600).sort((a, b) => b.width - a.width);
  const src = candidates[0]?.url ?? attr(tag, 'data-lazy-src') ?? attr(tag, 'data-src') ?? attr(tag, 'src');
  if (!src || !/^https:\/\//i.test(src) || SKIP_IMAGE.test(src)) return undefined;
  const url = cleanText(src);
  return candidates[0] ? url : url.replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)(?:\?|$))/i, '');
};

/** Rezeptbild aus dem Seiteninhalt, wenn og:image fehlt (z. B. WP-Recipe-Maker-Druckansicht). */
const contentImage = (html: string): string | undefined => {
  const recipeImage = html.match(/class=["'][^"']*recipe-image[^"']*["'][^>]*>[\s\S]{0,600}?(<img\b[^>]*>)/i)?.[1];
  const fromRecipe = recipeImage ? bestImageSource(recipeImage) : undefined;
  if (fromRecipe) return fromRecipe;
  const scope = html.match(/<(article|main)\b[\s\S]*<\/\1>/i)?.[0] ?? html;
  for (const [tag] of scope.matchAll(/<img\b[^>]*>/gi)) {
    const width = Number.parseInt(attr(tag, 'width') ?? '', 10);
    if (width && width < 200) continue;
    const url = bestImageSource(tag);
    if (url) return url;
  }
  return undefined;
};

const parseJson = (raw: string): Json | undefined => {
  const body = raw.trim().replace(/^<!--/, '').replace(/-->$/, '').replace(/^\/\/\s*<!\[CDATA\[/, '').replace(/\/\/\s*\]\]>$/, '').trim();
  try {
    return JSON.parse(body) as Json;
  } catch {
    // Manche Seiten haben echte Zeilenumbrüche in Strings: einmal tolerant versuchen.
    try {
      return JSON.parse(body.replace(/[\r\n\t]+/g, ' ')) as Json;
    } catch {
      return undefined;
    }
  }
};

/** Schritte durchnummerieren, Abschnittsüberschriften (**…**) zählen nicht mit. */
const numberSteps = (lines: string[]) => {
  let n = 0;
  return lines.map((line) => (line.startsWith('**') ? line : `${++n}. ${line.replace(/^\d+[.)]\s*/, '')}`));
};

/** Rohfelder des schema.org-Rezepts, bereinigt, aber noch nicht auf Cookly abgebildet. */
export type SchemaRecipe = {
  title: string;
  /** Bild aus dem Rezept, sonst og:image, sonst erstes großes Inhaltsbild. */
  image?: string;
  description: string;
  author: string;
  ingredients: string[];
  steps: SchemaStep[];
  yields: string[];
  prepTime: string;
  cookTime: string;
  totalTime: string;
  categories: string[];
  cuisines: string[];
  keywords: string[];
  diets: string[];
  /** Sprache aus inLanguage oder <html lang>, z. B. "de-DE". Leer, wenn unbekannt. */
  language: string;
  /** Seitentitel (og:title oder <title>), um eingebettete Fremd-Rezepte zu erkennen. */
  pageTitle: string;
};

const list = (value: Json | undefined): string[] =>
  asArray(value)
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : [text(item)]))
    .map(cleanText)
    .filter(Boolean);

export const extractSchemaRecipe = (html: string): SchemaRecipe | null => {
  const scripts = html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, raw] of scripts) {
    const nodes = collectNodes(parseJson(raw));
    const recipe = nodes.find((node) => hasType(node, 'Recipe'));
    if (!recipe) continue;

    const title = text(recipe.name) || metaContent(html, 'og:title') || '';
    const ingredients = asArray(recipe.recipeIngredient ?? recipe.ingredients).map(text).filter(Boolean);
    const steps = instructionSteps(recipe.recipeInstructions);
    if (!title || !ingredients.length || !steps.length) continue;
    // Verweise wie {"@id": "…#author"} zeigen auf einen anderen Knoten im selben @graph.
    const byId = (value: Json | undefined) =>
      isObject(value) && typeof value['@id'] === 'string' && Object.keys(value).length === 1
        ? nodes.find((node) => node !== value && node['@id'] === value['@id']) ?? value
        : value;

    return {
      title,
      image: imageUrl(recipe.image) ?? imageUrl(metaContent(html, 'og:image') ?? null) ?? contentImage(html),
      description: text(recipe.description),
      author: asArray(recipe.author).map((item) => text(byId(item))).find(Boolean) ?? '',
      ingredients,
      steps,
      yields: asArray(recipe.recipeYield).map(text).filter(Boolean),
      prepTime: text(recipe.prepTime),
      cookTime: text(recipe.cookTime),
      totalTime: text(recipe.totalTime),
      categories: list(recipe.recipeCategory),
      cuisines: list(recipe.recipeCuisine),
      keywords: list(recipe.keywords),
      diets: list(recipe.suitableForDiet),
      language: text(recipe.inLanguage) || cleanText(html.match(/<html\b[^>]*\slang=["']([^"']+)["']/i)?.[1] ?? ''),
      pageTitle: metaContent(html, 'og:title') ?? cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    };
  }
  return null;
};

/** Kurzer Markdown-Text aus dem Schema-Rezept als Eingabe für Gemini. */
const schemaMarkdown = (recipe: SchemaRecipe) => {
  const facts = [
    ['Beschreibung', recipe.description],
    ['Portionen', recipe.yields.join(', ')],
    ['Zubereitungszeit', recipe.prepTime],
    ['Kochzeit', recipe.cookTime],
    ['Gesamtzeit', recipe.totalTime],
    ['Kategorie', recipe.categories.join(', ')],
    ['Küche', recipe.cuisines.join(', ')],
  ].filter(([, value]) => value);

  return [
    `# ${recipe.title}`,
    ...facts.map(([label, value]) => `${label}: ${value}`),
    '',
    '## Zutaten',
    ...recipe.ingredients.map((line) => `- ${line}`),
    '',
    '## Zubereitung',
    ...numberSteps(instructionLines(recipe.steps)),
  ].join('\n');
};

export const extractRecipeFromHtml = (html: string): (PageRecipe & { schema: SchemaRecipe }) | null => {
  const schema = extractSchemaRecipe(html);
  if (!schema) return null;
  return { title: schema.title, image: schema.image, content: schemaMarkdown(schema).slice(0, 20_000), schema };
};

const RECIPE_HINTS = [/zutaten|ingredients|ingrédients|ingredienti/i, /zubereitung|anleitung|instructions|directions|method|schritt|préparation|preparazione/i];

/**
 * Lesbarer Text einer Seite ohne JSON-LD (z. B. WP-Recipe-Maker-Druckansicht). Spart den Jina-Umweg (7–11 s),
 * weil das HTML ohnehin schon geladen ist. Nur wenn die Seite erkennbar Zutaten und Zubereitung enthält;
 * sonst (Cookie-Wand, per JavaScript gerenderte Seite) bleibt Jina zuständig.
 */
export const extractPageText = (html: string): PageRecipe | null => {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe|template)\b[\s\S]*?<\/\1>/gi, ' ');
  const main = withoutNoise.match(/<(article|main)\b[\s\S]*<\/\1>/i)?.[0];
  const body = main && cleanText(main).length >= 400 ? main : withoutNoise.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? withoutNoise;
  const content = body
    .replace(/<\/(p|div|li|tr|h[1-6]|section|ul|ol|table|blockquote)>|<br\s*\/?>/gi, '\n')
    .split('\n')
    .map(cleanText)
    .filter(Boolean)
    .join('\n');
  if (content.length < 400 || !RECIPE_HINTS.every((hint) => hint.test(content))) return null;

  const title = metaContent(html, 'og:title') ?? cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  return {
    title,
    image: imageUrl(metaContent(html, 'og:image') ?? null) ?? contentImage(html),
    content: content.slice(0, 20_000),
  };
};
