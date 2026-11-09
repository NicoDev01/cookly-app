/**
 * Einkaufsliste: Schlüssel für Convex-Einträge und die Darstellungslogik (Konzept 09.11.2026, im Labor entstanden).
 * - Abteilungen mit Überschrift; kurze Stichwörter („ei“, „tk“, „öl“) nur als ganzes Wort, sonst landet „Basmatireis“ bei den Eiern.
 * - Gleiche Zutat aus mehreren Rezepten = eine Zeile, Mengen zusammengerechnet.
 * - Schnelleingabe („2 Zwiebeln“), Vorschläge aus „zuletzt gekauft“, Text zum Teilen.
 */
export type ShoppingListViewItem = {
  _id: string;
  name: string;
  amount?: string;
  key: string;
  checked: boolean;
  createdAt: number;
  recipeId?: string;
  recipeTitle?: string;
};

const normalizeShoppingText = (value: string) => value.toLowerCase().trim().replace(/\s+/g, " ");

export const buildShoppingItemKey = (name: string, _amount?: string, recipeId?: string) => {
  const baseKey = normalizeShoppingText(name);
  return recipeId ? `${baseKey}|recipe:${recipeId}` : baseKey;
};

export const buildLegacyShoppingItemKeys = (name: string, amount?: string, recipeId?: string) => {
  const normalizedName = normalizeShoppingText(name);
  const normalizedAmount = amount ? normalizeShoppingText(amount) : "";
  return [
    recipeId && normalizedAmount ? `${normalizedName}|${normalizedAmount}|recipe:${recipeId}` : undefined,
    `${normalizedName}|${normalizedAmount}`,
    normalizedName,
  ].filter((key): key is string => Boolean(key));
};

export type Section = { key: string; title: string; emoji: string; keywords: string[] };

export const SECTIONS: Section[] = [
  {
    key: 'produce',
    title: 'Obst & Gemüse',
    emoji: '🥦',
    keywords: [
      'apfel', 'äpfel', 'banane', 'beere', 'birne', 'orange', 'zitrone', 'limette', 'avocado', 'tomate', 'kartoffel',
      'zwiebel', 'knoblauch', 'salat', 'gurke', 'paprika', 'karotte', 'möhre', 'zucchini', 'aubergine', 'pilz',
      'champignon', 'spinat', 'brokkoli', 'ingwer', 'obst', 'gemüse', 'kräuter', 'basilikum', 'petersilie', 'koriander',
      'lauch', 'porree', 'kürbis', 'rucola', 'minze', 'schnittlauch',
    ],
  },
  { key: 'bakery', title: 'Brot & Backwaren', emoji: '🥖', keywords: ['brot', 'brötchen', 'baguette', 'toast', 'wrap', 'tortilla', 'ciabatta'] },
  {
    key: 'meat-fish',
    title: 'Fleisch & Fisch',
    emoji: '🥩',
    keywords: [
      'hähnchen', 'huhn', 'pute', 'rind', 'schwein', 'hack', 'speck', 'schinken', 'salami', 'guanciale', 'pancetta',
      'schnitzel', 'lachs', 'fisch', 'thunfisch', 'garnelen', 'scampi',
    ],
  },
  {
    key: 'dairy-eggs',
    title: 'Kühlregal & Eier',
    emoji: '🧀',
    keywords: [
      'milch', 'butter', 'käse', 'parmesan', 'mozzarella', 'feta', 'joghurt', 'yoghurt', 'quark', 'sahne',
      'creme fraiche', 'crème fraîche', 'schmand', 'mascarpone', 'ei', 'eier', 'tofu',
    ],
  },
  {
    key: 'dry-goods',
    title: 'Nudeln, Reis & Hülsenfrüchte',
    emoji: '🍝',
    keywords: [
      'reis', 'pasta', 'nudel', 'spaghetti', 'penne', 'linguine', 'quinoa', 'couscous', 'bulgur', 'linsen', 'bohnen',
      'kichererbsen', 'hafer', 'müsli', 'cornflakes',
    ],
  },
  {
    key: 'cans-jars',
    title: 'Konserven & Gläser',
    emoji: '🥫',
    keywords: ['dose', 'passierte tomaten', 'tomatenmark', 'pesto', 'olive', 'kapern', 'mais', 'glas', 'brühe', 'fond', 'kokosmilch'],
  },
  {
    key: 'baking',
    title: 'Backen & Süßes',
    emoji: '🧁',
    keywords: ['mehl', 'zucker', 'backpulver', 'hefe', 'kakao', 'schokolade', 'vanille', 'stärke', 'löffelbiskuit', 'honig', 'sirup'],
  },
  {
    key: 'spices-oils',
    title: 'Gewürze, Öl & Saucen',
    emoji: '🧂',
    keywords: [
      'salz', 'pfeffer', 'curry', 'kümmel', 'oregano', 'thymian', 'zimt', 'öl', 'essig', 'sojasauce', 'senf',
      'ketchup', 'mayonnaise', 'brühwürfel',
    ],
  },
  { key: 'frozen', title: 'Tiefkühl', emoji: '❄️', keywords: ['tk', 'tiefkühl', 'gefroren'] },
  { key: 'drinks', title: 'Getränke', emoji: '🥤', keywords: ['wasser', 'saft', 'wein', 'bier', 'limonade', 'cola', 'kaffee', 'espresso', 'tee'] },
  { key: 'household', title: 'Haushalt', emoji: '🧻', keywords: ['papier', 'serviette', 'folie', 'beutel', 'reiniger', 'spülmittel'] },
];

export const OTHER_SECTION: Section = { key: 'other', title: 'Sonstiges', emoji: '🛒', keywords: [] };

const normalize = normalizeShoppingText;

/** Stichwörter bis 2 Zeichen nur als ganzes Wort, längere auch als Wortteil („Olivenöl“ → „öl“ ist 2 Zeichen, daher Wortende erlaubt). */
const matches = (name: string, keyword: string) => {
  if (keyword.length > 2) return name.includes(keyword);
  return name.split(/[\s,/()-]+/).some((word) => word === keyword || (keyword === 'öl' && word.endsWith('öl')));
};

export const sectionOf = (name: string): Section => {
  const searchable = normalize(name);
  // Öle zuerst, sonst landet „Olivenöl“ über „olive“ bei den Konserven.
  if (matches(searchable, 'öl')) return SECTIONS.find((s) => s.key === 'spices-oils')!;
  return SECTIONS.find((s) => s.keywords.some((k) => matches(searchable, k))) ?? OTHER_SECTION;
};

/** Eine Zeile der Liste: gleiche Zutaten aus mehreren Rezepten zusammengefasst. */
export type ShoppingRow = {
  key: string;
  name: string;
  amounts: string[];
  ids: string[];
  recipeIds: string[];
  checked: boolean;
  createdAt: number;
};

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** Eine Zahl: „2“, „2,5“, „1/2“, „½“, auch gemischt „1 ½“ / „1 1/2“. */
const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½¼¾⅓⅔])(?:\s+(?:\d+\s*\/\s*\d+|[½¼¾⅓⅔]))?`;
/**
 * Menge vorne: Zahl oder Bereich („2-3“, „2 – 3“), danach der Rest (Einheit/Name).
 * Ohne Leerzeichen nur kurze Einheiten („500g“), sonst würde „2er Pack“ zu „2“ + „er Pack“.
 */
const LEADING_AMOUNT = new RegExp(
  String.raw`^(${NUMBER}(?:\s*[-–]\s*${NUMBER})?)(?:\s+|(?=(?:kg|g|ml|cl|dl|l|el|tl)(?![a-zäöüß])))(.*)$|^(${NUMBER})$`,
  'i',
);

const parseNumber = (text: string): number =>
  text
    .split(/\s+(?=\d|[½¼¾⅓⅔])/)
    .reduce((sum, part) => {
      const fraction = part.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (fraction) return sum + Number(fraction[1]) / Number(fraction[2]);
      return sum + (FRACTIONS[part] ?? Number(part.replace(',', '.')));
    }, 0);

/** Gleiche Einheiten zusammenrechnen; kg/l werden dafür in g/ml umgerechnet. */
const BASE_UNITS: Record<string, { unit: string; factor: number }> = {
  kg: { unit: 'g', factor: 1000 },
  gramm: { unit: 'g', factor: 1 },
  l: { unit: 'ml', factor: 1000 },
  liter: { unit: 'ml', factor: 1000 },
};

const formatNumber = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

const formatSum = (value: number, unit: string) => {
  if (unit === 'g' && value >= 1000) return `${formatNumber(value / 1000)} kg`;
  if (unit === 'ml' && value >= 1000) return `${formatNumber(value / 1000)} l`;
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
};

/**
 * „3“ + „2“ → „5“, „1 l“ + „300 ml“ → „1,3 l“, „200 g“ + „1 Bund“ → „200 g + 1 Bund“.
 * Nicht lesbare Mengen („etwas“, „ca. 200 g“) und Bereiche („2-3 EL“) bleiben einzeln stehen.
 */
export const sumAmounts = (amounts: string[]): string => {
  if (amounts.length < 2) return amounts[0] ?? '';
  // Schlüssel = Einheit klein geschrieben; label behält die erste Schreibweise („EL“).
  const sums = new Map<string, { value: number; label: string }>();
  const rest: string[] = [];
  for (const amount of amounts) {
    const m = amount.trim().match(LEADING_AMOUNT);
    const num = m ? (m[1] ?? m[3]) : '';
    const value = num && !/[-–]/.test(num) ? parseNumber(num) : NaN;
    if (!m || !Number.isFinite(value)) {
      rest.push(amount.trim());
      continue;
    }
    const written = (m[2] ?? '').trim();
    const base = BASE_UNITS[written.toLowerCase()];
    const label = base?.unit ?? written;
    const key = label.toLowerCase();
    const prev = sums.get(key);
    sums.set(key, { value: (prev?.value ?? 0) + value * (base?.factor ?? 1), label: prev?.label ?? label });
  }
  return [...[...sums.values()].map((s) => formatSum(s.value, s.label)), ...rest].join(' + ');
};

export const formatAmounts = (row: Pick<ShoppingRow, 'amounts'>) => sumAmounts(row.amounts);

export const mergeRows = (items: ShoppingListViewItem[]): ShoppingRow[] => {
  const rows = new Map<string, ShoppingRow>();
  for (const item of items) {
    const key = normalize(item.name);
    const amount = item.amount?.trim();
    const row = rows.get(key);
    if (row) {
      row.ids.push(item._id);
      if (amount) row.amounts.push(amount);
      if (item.recipeId && !row.recipeIds.includes(item.recipeId)) row.recipeIds.push(item.recipeId);
      row.checked = row.checked && item.checked;
      row.createdAt = Math.min(row.createdAt, item.createdAt);
    } else {
      rows.set(key, {
        key,
        name: item.name.trim(),
        amounts: amount ? [amount] : [],
        ids: [item._id],
        recipeIds: item.recipeId ? [item.recipeId] : [],
        checked: item.checked,
        createdAt: item.createdAt,
      });
    }
  }
  return [...rows.values()];
};

const OWN_GROUP = 'own';

export type RowGroup = { key: string; title: string; emoji?: string; recipeId?: string; rows: ShoppingRow[] };

export const groupBySection = (rows: ShoppingRow[]): RowGroup[] =>
  [...SECTIONS, OTHER_SECTION]
    .map((s) => ({ key: s.key, title: s.title, emoji: s.emoji, rows: rows.filter((r) => sectionOf(r.name).key === s.key) }))
    .filter((g) => g.rows.length > 0);

/** Nach Rezept: hier bewusst ohne Zusammenfassen, damit jedes Rezept seine eigene Menge zeigt. */
export const groupByRecipe = (items: ShoppingListViewItem[]): RowGroup[] => {
  const groups = new Map<string, RowGroup>();
  for (const item of items) {
    // Alte Einträge ohne recipeId haben teils nur den vom Server erschlossenen Titel.
    const title = item.recipeTitle?.trim();
    const key = item.recipeId ?? title ?? OWN_GROUP;
    const group = groups.get(key) ?? { key, title: title || 'Eigene Einträge', recipeId: item.recipeId, rows: [] };
    group.rows.push(...mergeRows([item]));
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === OWN_GROUP) return 1;
    if (b.key === OWN_GROUP) return -1;
    return a.title.localeCompare(b.title, 'de');
  });
};

/**
 * Schnelleingabe: „2 Zwiebeln“, „500 g Mehl“, „1,5 l Milch“ → Menge + Name. Ohne Zahl vorne alles Name.
 * Einheiten nur, wenn sie direkt nach der Zahl stehen, damit „2 Eier“ nicht „Eier“ als Einheit liest.
 */
const UNITS = [
  'g', 'gramm', 'kg', 'ml', 'l', 'liter', 'el', 'tl', 'msp', 'stück', 'stk', 'pck', 'packung', 'packungen', 'dose', 'dosen',
  'bund', 'prise', 'becher', 'glas', 'gläser', 'flasche', 'flaschen', 'kopf', 'tasse', 'tassen', 'zehe', 'zehen',
  'scheibe', 'scheiben', 'handvoll', 'netz', 'beutel',
];

export const parseQuickAdd = (text: string): { name: string; amount?: string } | null => {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  const m = clean.match(LEADING_AMOUNT);
  // Nur eine Zahl („7“) ist ein Name, keine Menge.
  if (!m || !m[2]) return { name: clean };
  const num = m[1].replace(/\s*([-–/])\s*/g, '$1');
  const [maybeUnit, ...rest] = m[2].split(' ');
  if (UNITS.includes(maybeUnit.toLowerCase()) && rest.length) return { amount: `${num} ${maybeUnit}`, name: rest.join(' ') };
  return { amount: num, name: m[2] };
};

/**
 * Vorschläge unter dem Eingabefeld (wie AnyList/Bring „Zuletzt verwendet“): leeres Feld = zuletzt gekauft,
 * beim Tippen passende Namen. Was schon offen auf der Liste steht, fehlt; Abgehaktes kommt als „wieder offen“.
 */
export const suggest = (draft: string, recents: string[], rows: ShoppingRow[], limit = 8): string[] => {
  const open = new Set(rows.filter((r) => !r.checked).map((r) => r.key));
  const query = normalize(parseQuickAdd(draft)?.name ?? '');
  const pool = [...rows.filter((r) => r.checked).map((r) => r.name), ...recents];
  const seen = new Set<string>();
  return pool
    .filter((name) => {
      const key = normalize(name);
      const hit = key.startsWith(query) || key.includes(` ${query}`);
      if (open.has(key) || seen.has(key) || (query && (!hit || key === query))) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
};

/** Text zum Teilen (WhatsApp & Co.): nur offene Einträge, nach Abteilung. */
export const shareText = (rows: ShoppingRow[]) => {
  const open = rows.filter((r) => !r.checked);
  const blocks = groupBySection(open).map(
    (g) => `${g.emoji} ${g.title}\n${g.rows.map((r) => `• ${r.amounts.length ? `${formatAmounts(r)} ` : ''}${r.name}`).join('\n')}`,
  );
  return `Einkaufsliste\n\n${blocks.join('\n\n')}`;
};
