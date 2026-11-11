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
      if (/^#x/i.test(code)) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
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

/** Schritte aus Text, HowToStep oder HowToSection (mit Überschrift). */
const instructionLines = (value: Json | undefined, depth = 0): string[] => {
  if (depth > 4) return [];
  if (typeof value === 'string') {
    return value.split(/\r?\n+/).map(cleanText).filter(Boolean);
  }
  return asArray(value).flatMap((item) => {
    if (typeof item === 'string') return instructionLines(item, depth + 1);
    if (!isObject(item)) return [];
    if (hasType(item, 'HowToSection') || item.itemListElement) {
      const steps = instructionLines(item.itemListElement, depth + 1);
      const name = text(item.name);
      return name && steps.length ? [`**${name}**`, ...steps] : steps;
    }
    const line = text(item.text ?? item.name);
    return line ? [line] : [];
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

export const extractRecipeFromHtml = (html: string): PageRecipe | null => {
  const scripts = html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, raw] of scripts) {
    const recipe = collectNodes(parseJson(raw)).find((node) => hasType(node, 'Recipe'));
    if (!recipe) continue;

    const title = text(recipe.name) || metaContent(html, 'og:title') || '';
    const ingredients = asArray(recipe.recipeIngredient ?? recipe.ingredients).map(text).filter(Boolean);
    const steps = instructionLines(recipe.recipeInstructions);
    if (!title || !ingredients.length || !steps.length) continue;

    const facts = [
      ['Beschreibung', text(recipe.description)],
      ['Portionen', text(recipe.recipeYield)],
      ['Zubereitungszeit', text(recipe.prepTime)],
      ['Kochzeit', text(recipe.cookTime)],
      ['Gesamtzeit', text(recipe.totalTime)],
      ['Kategorie', text(recipe.recipeCategory)],
      ['Küche', text(recipe.recipeCuisine)],
    ].filter(([, value]) => value);

    const content = [
      `# ${title}`,
      ...facts.map(([label, value]) => `${label}: ${value}`),
      '',
      '## Zutaten',
      ...ingredients.map((line) => `- ${line}`),
      '',
      '## Zubereitung',
      ...numberSteps(steps),
    ].join('\n');

    return {
      title,
      image: imageUrl(recipe.image) ?? imageUrl(metaContent(html, 'og:image') ?? null),
      content: content.slice(0, 20_000),
    };
  }
  return null;
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
    image: imageUrl(metaContent(html, 'og:image') ?? null),
    content: content.slice(0, 20_000),
  };
};
