/** Datums-Helfer für den Wochenplan. Daten als YYYY-MM-DD in lokaler Zeit, Wochen beginnen am Montag. */

export type WeekSlot = { date: string; scope: 'day' | 'week' };

export const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fromDateString = (date: string) => new Date(`${date}T00:00:00`);

export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const mondayOf = (d: Date) => {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};

/** Montag der Woche `offset` relativ zu heute (0 = diese Woche). */
export const weekStartForOffset = (offset: number, today = new Date()) => addDays(mondayOf(today), offset * 7);

export const weekDays = (weekStart: Date) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/** ISO-Kalenderwoche. */
export const weekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

export const shortDay = (d: Date) => d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');

export const longDay = (d: Date) => d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

/** „Diese Woche“, „Nächste Woche“ … statt nur KW-Nummern: So denkt man beim Planen. */
export const weekLabel = (offset: number, kw: number) => {
  if (offset === 0) return 'Diese Woche';
  if (offset === 1) return 'Nächste Woche';
  if (offset === -1) return 'Letzte Woche';
  return `KW ${kw}`;
};

/** Kurzlabel, wo ein Rezept in der Woche schon steht („Di“ oder „Ohne Tag“). */
export const slotLabel = (slot: WeekSlot) => (slot.scope === 'week' ? 'Ohne Tag' : shortDay(fromDateString(slot.date)));
