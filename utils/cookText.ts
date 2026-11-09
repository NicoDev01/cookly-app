import type { Ingredient } from '../types';
import {
  buildKeywords,
  createIngredientTextPattern,
  mergeAdjacentIngredientMatches,
  type IngredientTextMatch,
} from './ingredientKeywordPattern.ts';

/**
 * Zerlegt die Schritte für den Kochmodus in Text, Zutaten, Zeiten und Hitzeangaben.
 * Reine Logik ohne React, damit sie testbar ist.
 */

export type CookSegment =
  | { kind: 'text'; text: string }
  /** amount nur beim ersten Vorkommen der Zutat, sonst null. */
  | { kind: 'ingredient'; text: string; index: number; amount: string | null }
  | { kind: 'time'; text: string; seconds: number }
  | { kind: 'heat'; text: string };

export interface CookSteps {
  segments: CookSegment[][];
  /** Name für Timer aus diesem Schritt, z. B. "Tomaten"; sonst "Schritt 3". */
  labels: string[];
  /** z. B. "Ofen auf 180 °C vorheizen", wenn der Ofen erst später vorkommt. */
  ovenHint: string | null;
}

// "10 Minuten", "6–8 Minuten", "1 Std.", "30 Sek." – bei Spannen zählt der höhere Wert.
const TIME_PATTERN = /(\d+)(?:\s*(?:-|–|bis)\s*(\d+))?\s*(Minuten|Minute|Min\.?|Stunden|Stunde|Std\.?|Sekunden|Sek\.?)(?![\p{L}])/giu;
const unitSeconds = (unit: string) => (/^s(td|tunde)/i.test(unit) ? 3600 : /^sek/i.test(unit) ? 1 : 60);

// "180 °C", "200 Grad Umluft", "mittlerer Hitze", "Ober-/Unterhitze"
const TEMPERATURE = String.raw`\d+\s*(?:°\s*C|°|Grad)(?:\s+(?:Ober-\/Unterhitze|Umluft))?`;
const HEAT_PATTERN = new RegExp(
  String.raw`${TEMPERATURE}|(?:niedrig|klein|mittler|mittelhoh|hoh|stark|schwach|voll)(?:e|er|en|em)?\s+Hitze|Ober-\/Unterhitze|Umluft`,
  'giu',
);
const OVEN = /\b(?:Back)?ofen\b/i;
const PREHEAT = /vorheiz/i;

/** Reine Stückzahl als "4 ×", mit Einheit so wie sie ist ("1 Dose"). */
export const amountPrefix = (amount: string | undefined): string | null => {
  const a = amount?.trim();
  if (!a) return null;
  return /^[\d.,½¼¾⅓⅔–-]+$/.test(a) ? `${a} ×` : a;
};

type Mark = { start: number; end: number; seg: CookSegment };

export const buildCookSteps = (steps: string[], ingredients: Ingredient[]): CookSteps => {
  const keywords = buildKeywords(ingredients);
  const pattern = createIngredientTextPattern(keywords.map(({ keyword }) => keyword));
  const seen = new Set<number>();

  const segments = steps.map((text) => {
    const marks: Mark[] = [];
    if (pattern) {
      const found: IngredientTextMatch[] = [];
      for (const m of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
        const ingredientIndex = keywords[m.slice(1).findIndex(Boolean)]?.ingredientIndex;
        if (ingredientIndex !== undefined) found.push({ start: m.index, end: m.index + m[0].length, ingredientIndex });
      }
      for (const { start, end, ingredientIndex } of mergeAdjacentIngredientMatches(text, found)) {
        marks.push({ start, end, seg: { kind: 'ingredient', text: text.slice(start, end), index: ingredientIndex, amount: null } });
      }
    }
    for (const m of text.matchAll(TIME_PATTERN)) {
      marks.push({ start: m.index, end: m.index + m[0].length, seg: { kind: 'time', text: m[0], seconds: Number(m[2] ?? m[1]) * unitSeconds(m[3]) } });
    }
    for (const m of text.matchAll(HEAT_PATTERN)) {
      marks.push({ start: m.index, end: m.index + m[0].length, seg: { kind: 'heat', text: m[0] } });
    }
    marks.sort((a, b) => a.start - b.start);

    const out: CookSegment[] = [];
    let pos = 0;
    for (const { start, end, seg } of marks) {
      if (start < pos) continue; // überlappt, erster gewinnt
      if (start > pos) out.push({ kind: 'text', text: text.slice(pos, start) });
      // Menge nur beim ersten Vorkommen; später wäre die volle Menge oft falsch ("restliche Butter").
      if (seg.kind === 'ingredient' && !seen.has(seg.index)) {
        seen.add(seg.index);
        out.push({ ...seg, amount: amountPrefix(ingredients[seg.index]?.amount) });
      } else {
        out.push(seg);
      }
      pos = end;
    }
    if (pos < text.length) out.push({ kind: 'text', text: text.slice(pos) });
    return out;
  });

  const labels = segments.map((segs, i) => {
    const first = segs.find((s) => s.kind === 'ingredient');
    return first ? first.text.charAt(0).toUpperCase() + first.text.slice(1) : `Schritt ${i + 1}`;
  });

  let ovenHint: string | null = null;
  const ovenStep = steps.findIndex((t) => OVEN.test(t) && new RegExp(TEMPERATURE, 'iu').test(t));
  const preheatMentioned = steps.slice(0, Math.max(0, ovenStep) + 1).some((t) => PREHEAT.test(t));
  if (ovenStep > 0 && !preheatMentioned) {
    const temp = steps[ovenStep].match(new RegExp(TEMPERATURE, 'iu'))?.[0];
    if (temp) ovenHint = `Ofen auf ${temp} vorheizen`;
  }

  return { segments, labels, ovenHint };
};
