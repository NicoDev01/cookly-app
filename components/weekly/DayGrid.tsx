import React from 'react';
import { shortDay, toDateString, type WeekSlot } from '../../utils/weekPlan';

/**
 * Tage einer Woche als Raster (Mo–So + „Ohne Tag“). Genutzt zum Verschieben im Wochenplan
 * und für „Zum Plan“ auf der Rezeptseite, damit beides gleich aussieht.
 */
const DayGrid: React.FC<{
  days: Date[];
  /** Aktueller Platz: wird hervorgehoben und ist nicht wählbar. */
  current?: WeekSlot;
  /** Plätze mit Haken (z. B. „dieses Rezept steht hier schon“), bleiben wählbar. */
  marked?: WeekSlot[];
  todayStr?: string;
  onPick: (slot: WeekSlot) => void;
}> = ({ days, current, marked = [], todayStr, onPick }) => {
  const dayStrings = days.map(toDateString);
  const isMarked = (slot: WeekSlot) => marked.some((m) => m.scope === slot.scope && (slot.scope === 'week' || m.date === slot.date));
  const chip = (active: boolean) =>
    `relative flex flex-col items-center justify-center rounded-2xl border border-solid py-2 transition active:scale-95 ${
      active ? 'border-primary bg-primary text-white' : 'border-black/10 text-text-primary-light dark:border-white/15 dark:text-text-primary-dark'
    }`;
  const check = <span className="material-symbols-outlined filled absolute -right-1 -top-1 rounded-full bg-background-light text-[18px] text-primary dark:bg-background-dark">check_circle</span>;
  const weekSlot: WeekSlot = { date: dayStrings[0], scope: 'week' };
  const isWeek = current?.scope === 'week';

  return (
    <div className="grid grid-cols-4 gap-2">
      {days.map((d, i) => {
        const slot: WeekSlot = { date: dayStrings[i], scope: 'day' };
        const active = current?.scope === 'day' && current.date === slot.date;
        return (
          <button key={slot.date} type="button" disabled={active} onClick={() => onPick(slot)} className={chip(active)} aria-label={d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}>
            <span className={`text-[11px] font-bold uppercase ${!active && slot.date === todayStr ? 'text-primary' : ''}`}>{shortDay(d)}</span>
            <span className="text-base font-bold">{d.getDate()}</span>
            {!active && isMarked(slot) && check}
          </button>
        );
      })}
      <button type="button" disabled={isWeek} onClick={() => onPick(weekSlot)} className={chip(isWeek)} aria-label="Ohne festen Tag">
        <span className="material-symbols-outlined text-[22px]">calendar_month</span>
        {!isWeek && isMarked(weekSlot) && check}
      </button>
    </div>
  );
};

export default DayGrid;
