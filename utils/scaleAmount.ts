/**
 * Rechnet eine freie Mengenangabe ("1 Dose", "200 g", "1-2 EL", "eine halbe Zitrone") auf einen Faktor um.
 * Nur die führende Zahl wird skaliert; alles danach bleibt stehen ("1 Dose (400 g)" → "2 Dosen (400 g)").
 * Was keine Zahl hat ("etwas", "nach Belieben"), bleibt unverändert.
 * Ausgabe immer als Dezimalzahl mit Komma statt Bruch ("1,5" statt "1½").
 */

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, eines: 1,
  zwei: 2, drei: 3, vier: 4, 'fünf': 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, 'zwölf': 12,
  halb: 0.5, halbe: 0.5, halber: 0.5, halbes: 0.5, halben: 0.5,
  anderthalb: 1.5, eineinhalb: 1.5,
};
/** "ein paar", "ein wenig", "ein bisschen" sind keine Mengen. */
const NOT_A_QUANTITY_AFTER_WORD = /^\s*(paar|wenig|bisschen)\b/i;

/** Einheiten mit eigener Mehrzahl. Alles andere (g, EL, Bund, Stück, Handvoll …) bleibt gleich. */
const UNIT_PLURALS: Record<string, string> = {
  Dose: 'Dosen', Prise: 'Prisen', Zehe: 'Zehen', Packung: 'Packungen', Tasse: 'Tassen', Scheibe: 'Scheiben',
  Zweig: 'Zweige', Kugel: 'Kugeln', Messerspitze: 'Messerspitzen', Blatt: 'Blätter', Stange: 'Stangen',
  Knolle: 'Knollen', Flasche: 'Flaschen', Glas: 'Gläser', 'Tüte': 'Tüten', Rolle: 'Rollen', Platte: 'Platten',
  Stiel: 'Stiele', Ecke: 'Ecken', Kopf: 'Köpfe', Kiste: 'Kisten', Schale: 'Schalen',
};
const UNIT_SINGULARS: Record<string, string> = Object.fromEntries(Object.entries(UNIT_PLURALS).map(([s, p]) => [p, s]));

const PREFIX = String.raw`(?:ca\.?|circa|etwa|ungefähr|je)\s+`;
const NUM = String.raw`(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d*\s?[${FRACTION_CHARS}]|\d{1,3}(?:\.\d{3})+(?!\d)|\d+(?:[.,]\d+)?)`;
const RANGE = String.raw`\s*(?:-|–|—|bis)\s*`;
const DIGIT_AMOUNT = new RegExp(`^(\\s*(?:${PREFIX})?)(${NUM})(?:(${RANGE})(${NUM}))?`, 'i');
const WORD_AMOUNT = new RegExp(`^(\\s*(?:${PREFIX})?)(${Object.keys(NUMBER_WORDS).join('|')})(?![\\p{L}])`, 'iu');

const parseNumber = (raw: string): number => {
  const s = raw.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, '')); // "1.000" = tausend
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const uni = s.match(new RegExp(`^(\\d*)\\s?([${FRACTION_CHARS}])$`));
  if (uni) return Number(uni[1] || 0) + UNICODE_FRACTIONS[uni[2]];
  return Number(s.replace(',', '.'));
};

type UnitKind = 'fine' | 'coarse' | 'count';
const unitKind = (unit: string): UnitKind => {
  const u = unit.toLowerCase().replace(/\.$/, '');
  if (['g', 'gr', 'gramm', 'mg', 'ml', 'milliliter'].includes(u)) return 'fine';
  if (['kg', 'kilo', 'kilogramm', 'l', 'liter', 'cl', 'dl'].includes(u)) return 'coarse';
  return 'count';
};

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** Küchentaugliche Rundung: Gramm ganz (ab 50 auf 5), kg/l auf 0,1, Stück und Löffel auf 0,5 (unter 1 auf 0,25). */
const roundForKitchen = (value: number, kind: UnitKind): number => {
  if (kind === 'fine') return value >= 50 ? roundTo(value, 5) : value >= 10 ? Math.round(value) : Math.max(0.5, roundTo(value, 0.5));
  if (kind === 'coarse') return Math.max(0.05, roundTo(value, value >= 1 ? 0.1 : 0.05));
  return value >= 1 ? roundTo(value, 0.5) : Math.max(0.25, roundTo(value, 0.25));
};

export const formatGermanNumber = (value: number): string =>
  String(Math.round(value * 100) / 100).replace('.', ',');

/** Passt das erste Wort nach der Zahl an: bis 1 Einzahl ("0,5 Dose"), darüber Mehrzahl ("1,5 Dosen"). */
const fixUnitNumber = (rest: string, value: number): string =>
  rest.replace(/^(\s*)([\p{L}]+)/u, (match, space: string, word: string) => {
    if (value <= 1 && UNIT_SINGULARS[word]) return space + UNIT_SINGULARS[word];
    if (value > 1 && UNIT_PLURALS[word]) return space + UNIT_PLURALS[word];
    return match;
  });

export const scaleAmount = (amount: string | undefined, factor: number): string | undefined => {
  if (!amount || factor === 1 || !Number.isFinite(factor) || factor <= 0) return amount;

  const digits = amount.match(DIGIT_AMOUNT);
  if (digits) {
    const [whole, prefix, from, rangeSep, to] = digits;
    let rest = amount.slice(whole.length);
    const kind = unitKind(rest.trim().split(/\s+/)[0] ?? '');
    const a = roundForKitchen(parseNumber(from) * factor, kind);
    if (to !== undefined) {
      const b = roundForKitchen(parseNumber(to) * factor, kind);
      rest = fixUnitNumber(rest, b);
      return `${prefix}${formatGermanNumber(a)}${rangeSep}${formatGermanNumber(b)}${rest}`;
    }
    // "1½ Dosen" ohne Leerzeichen: Leerzeichen vor dem Rest ergänzen.
    if (rest && /^[\p{L}]/u.test(rest) && /[^\d\s]$/.test(from)) rest = ` ${rest}`;
    return `${prefix}${formatGermanNumber(a)}${fixUnitNumber(rest, a)}`;
  }

  const word = amount.match(WORD_AMOUNT);
  if (word && !NOT_A_QUANTITY_AFTER_WORD.test(amount.slice(word[0].length))) {
    const [whole, prefix, numberWord] = word;
    let rest = amount.slice(whole.length);
    let base = NUMBER_WORDS[numberWord.toLowerCase()];
    // "eine halbe Zitrone" = 0,5
    const half = rest.match(/^\s+(halbe|halber|halbes|halben)(?![\p{L}])/iu);
    if (half && base === 1) { base = 0.5; rest = rest.slice(half[0].length); }
    const kind = unitKind(rest.trim().split(/\s+/)[0] ?? '');
    const value = roundForKitchen(base * factor, kind);
    return `${prefix}${formatGermanNumber(value)}${fixUnitNumber(rest, value)}`;
  }

  return amount;
};
