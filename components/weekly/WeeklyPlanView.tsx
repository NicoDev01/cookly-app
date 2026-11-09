/**
 * Wochenplan-Ansicht (Konzept 09.11.2026, im Labor als v1 entstanden). Reine Darstellung:
 * Daten und Speichern kommen von außen, damit App (Convex) und Labor (Testdaten) dieselbe Ansicht nutzen.
 * - 7 kompakte Tageszeilen + „Ohne festen Tag“; ein „+“ pro Tag an fester Stelle.
 * - ⋮-Sheet zum Verschieben/Entfernen, Entfernen mit „Rückgängig“.
 * - Gedrückt halten startet die Mehrfachauswahl (wie CategoryRecipesPage).
 * - Wischen wechselt die Woche; leere Woche: „Vorwoche übernehmen“; „Zutaten einkaufen“ für die ganze Woche.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { Id } from '../../convex/_generated/dataModel';
import ImageWithBlurhash from '../ImageWithBlurhash';
import { useHaptic } from '../../hooks/useHaptic';
import { useNotification } from '../../contexts/NotificationContext';
import {
  longDay,
  shortDay,
  toDateString,
  weekDays,
  weekLabel,
  weekNumber,
  weekStartForOffset,
  type WeekSlot,
} from '../../utils/weekPlan';
import BottomSheet from './BottomSheet';
import DayGrid from './DayGrid';

export type WeekMeal = {
  mealId: Id<'weeklyMeals'>;
  date: string;
  scope: 'day' | 'week';
  recipe: {
    _id: Id<'recipes'>;
    title: string;
    image?: string;
    imageBlurhash?: string;
    sourceImageUrl?: string;
  };
};

type Props = {
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
  /** Gerichte der angezeigten Woche; `loading` dimmt die Liste, solange eine neue Woche lädt. */
  meals: WeekMeal[];
  loading?: boolean;
  canRepeatPreviousWeek: boolean;
  onRepeatPreviousWeek: () => void;
  /** Anzahl Rezepte der Woche, die noch nicht auf der Einkaufsliste stehen. */
  toShopCount: number;
  onAddToShopping: () => void;
  shoppingPath: string;
  recipeLink: (recipeId: Id<'recipes'>) => { to: string; state?: unknown };
  onAdd: (slot: WeekSlot) => void;
  onMove: (meals: WeekMeal[], slot: WeekSlot) => void;
  onRemove: (meals: WeekMeal[]) => void;
  onRestore: (meals: WeekMeal[]) => void;
};

const UNDO_MS = 5000;
/** Wie CategoryRecipesPage: kurz genug für Absicht, lang genug, um nicht beim Scrollen auszulösen. */
const LONG_PRESS_MS = 500;

type SheetState = { kind: 'meal'; mealId: string } | { kind: 'move-selected' } | null;

const MealThumb: React.FC<{ recipe: WeekMeal['recipe'] }> = ({ recipe }) => {
  const src = recipe.image || recipe.sourceImageUrl;
  return src ? (
    <ImageWithBlurhash src={src} blurhash={recipe.imageBlurhash} alt={recipe.title} className="h-12 w-12 rounded-full object-cover" />
  ) : (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white">
      <span className="material-symbols-outlined text-xl">restaurant</span>
    </div>
  );
};

type MealCardProps = {
  meal: WeekMeal;
  link: { to: string; state?: unknown };
  muted: boolean;
  selecting: boolean;
  selected: boolean;
  onMore: () => void;
  onLongPress: () => void;
  onToggle: () => void;
};

const MealCard: React.FC<MealCardProps> = ({ meal, link, muted, selecting, selected, onMore, onLongPress, onToggle }) => {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div
      onPointerDown={(e) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => {
          fired.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        // Mehr als 10 px Bewegung = Scrollen, kein Halten.
        if (s && (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10)) cancel();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        // Nach dem Halten kein Öffnen; in der Auswahl schaltet ein Tipp nur die Markierung um.
        if (!fired.current && !selecting) return;
        e.preventDefault();
        e.stopPropagation();
        if (!fired.current) onToggle();
        fired.current = false;
      }}
      style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none' }}
      className={`flex select-none items-center gap-3 rounded-full p-1.5 pr-1 transition-[opacity,background-color,box-shadow] duration-150 ${
        selected ? 'bg-primary/15 ring-2 ring-primary' : 'bg-card-light shadow-neo-light-convex dark:bg-card-dark dark:shadow-neo-dark-convex'
      } ${muted && !selecting ? 'opacity-55' : ''} animate-in fade-in duration-200`}
    >
      <Link to={link.to} state={link.state} draggable={false} className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70">
        <div className="relative h-12 w-12 flex-shrink-0">
          <MealThumb recipe={meal.recipe} />
          {selected && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/25 text-white animate-in zoom-in-50 duration-150">
              <span className="material-symbols-outlined filled text-[26px]">check_circle</span>
            </span>
          )}
        </div>
        <p className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-tight text-text-primary-light dark:text-text-primary-dark">{meal.recipe.title}</p>
      </Link>
      {selecting ? (
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center" aria-hidden>
          <span className={`material-symbols-outlined text-[24px] ${selected ? 'filled text-primary' : 'text-gray-300 dark:text-gray-600'}`}>
            {selected ? 'check_circle' : 'radio_button_unchecked'}
          </span>
        </span>
      ) : (
        <button
          type="button"
          onClick={onMore}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-text-secondary-light active:bg-black/5 dark:text-text-secondary-dark dark:active:bg-white/10"
          aria-label={`Optionen für ${meal.recipe.title}`}
        >
          <span className="material-symbols-outlined text-[22px]">more_vert</span>
        </button>
      )}
    </div>
  );
};

const AddButton: React.FC<{ label: string; hidden: boolean; onClick: () => void }> = ({ label, hidden, onClick }) => (
  <div className={`pt-1.5 transition-opacity ${hidden ? 'pointer-events-none opacity-0' : ''}`} onClick={(e) => e.stopPropagation()}>
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      tabIndex={hidden ? -1 : undefined}
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-primary transition active:scale-90 active:bg-primary/10"
    >
      <span className="material-symbols-outlined text-[24px]">add_circle</span>
    </button>
  </div>
);

/** Fixed-Elemente per Portal: page-enter setzt ein transform, fixed klebte sonst am Seitenende. */
const FloatingBar: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  createPortal(
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-150"
      style={{ bottom: 'calc(var(--nav-height) + var(--safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      {children}
    </div>,
    document.body,
  );

const WeeklyPlanView: React.FC<Props> = ({
  weekOffset,
  onWeekOffsetChange,
  meals,
  loading = false,
  canRepeatPreviousWeek,
  onRepeatPreviousWeek,
  toShopCount,
  onAddToShopping,
  shoppingPath,
  recipeLink,
  onAdd,
  onMove,
  onRemove,
  onRestore,
}) => {
  const { impact } = useHaptic();
  const { showToast } = useNotification();
  const todayStr = toDateString(new Date());

  const [sheet, setSheet] = useState<SheetState>(null);
  const [undo, setUndo] = useState<WeekMeal[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selecting = selected.size > 0;
  const undoTimer = useRef<number | undefined>(undefined);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const weekStart = weekStartForOffset(weekOffset);
  const days = weekDays(weekStart);
  const dayStrings = days.map(toDateString);
  const kw = weekNumber(weekStart);
  const dayMealsOf = (date: string) => meals.filter((m) => m.scope === 'day' && m.date === date);
  const unscheduled = meals.filter((m) => m.scope === 'week');
  const allShopped = meals.length > 0 && toShopCount === 0;

  // Während der Auswahl sind Wochenwechsel und Wischen gesperrt, die Auswahl bleibt also in einer Woche.
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const changeWeek = (offset: number) => {
    onWeekOffsetChange(offset);
    void impact('light');
  };

  const move = (list: WeekMeal[], slot: WeekSlot) => {
    onMove(list, slot);
    setSheet(null);
    setSelected(new Set());
    void impact('light');
  };

  const remove = (list: WeekMeal[]) => {
    onRemove(list);
    setSheet(null);
    setSelected(new Set());
    setUndo(list);
    void impact('medium');
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  };

  const restore = () => {
    if (!undo) return;
    onRestore(undo);
    setUndo(null);
    window.clearTimeout(undoTimer.current);
  };

  // Mehrfachauswahl: Halten startet sie, Tippen schaltet um, die letzte Abwahl beendet sie.
  const toggleSelected = (mealId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(mealId)) next.delete(mealId);
      else next.add(mealId);
      return next;
    });
    void impact('light');
  };
  const startSelection = (mealId: string) => {
    if (selecting) return toggleSelected(mealId);
    setSelected(new Set([mealId]));
    void impact('medium');
  };
  const selectedMeals = meals.filter((m) => selected.has(m.mealId));

  // Waagrecht wischen wechselt die Woche, wie beim Blättern im Kalender.
  const onTouchStart = (e: React.TouchEvent) => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s || selecting) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    changeWeek(weekOffset + (dx < 0 ? 1 : -1));
  };

  const share = async () => {
    const lines = days.flatMap((d, i) => {
      const titles = dayMealsOf(dayStrings[i]).map((m) => m.recipe.title);
      return titles.length ? [`${shortDay(d)}: ${titles.join(', ')}`] : [];
    });
    if (unscheduled.length) lines.push(`Ohne Tag: ${unscheduled.map((m) => m.recipe.title).join(', ')}`);
    const text = `Wochenplan KW ${kw}\n\n${lines.join('\n')}`;
    try {
      if (navigator.share) await navigator.share({ title: `Wochenplan KW ${kw}`, text });
      else {
        await navigator.clipboard.writeText(text);
        showToast('Plan kopiert.', 'success');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showToast('Teilen hat nicht geklappt.', 'error');
    }
  };

  const renderCard = (meal: WeekMeal, muted: boolean) => (
    <MealCard
      key={meal.mealId}
      meal={meal}
      link={recipeLink(meal.recipe._id)}
      muted={muted}
      selecting={selecting}
      selected={selected.has(meal.mealId)}
      onMore={() => setSheet({ kind: 'meal', mealId: meal.mealId })}
      onLongPress={() => startSelection(meal.mealId)}
      onToggle={() => toggleSelected(meal.mealId)}
    />
  );

  const sheetMeal = sheet?.kind === 'meal' ? meals.find((m) => m.mealId === sheet.mealId) : undefined;
  const iconButton =
    'flex h-10 w-10 items-center justify-center rounded-full bg-card-light text-text-primary-light shadow-neo-light-convex transition active:scale-95 disabled:opacity-40 dark:bg-card-dark dark:text-text-primary-dark dark:shadow-neo-dark-convex';
  const arrowButton = 'flex h-10 w-10 items-center justify-center rounded-full text-text-primary-light active:bg-black/5 dark:text-text-primary-dark';

  return (
    <div className="page-enter relative flex w-full flex-col overflow-x-hidden bg-background-light font-display dark:bg-background-dark">
      <header className="px-6 pb-2" style={{ paddingTop: 'calc(var(--safe-area-inset-top, 0px) + 0.75rem)' }}>
        {selecting ? (
          <div className="flex h-10 items-center justify-between gap-3 animate-in fade-in duration-150">
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Auswahl beenden" className={iconButton}>
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
            <span className="flex-1 text-lg font-bold text-text-primary-light dark:text-text-primary-dark">{selected.size} ausgewählt</span>
            <button
              type="button"
              onClick={() => setSelected(selected.size === meals.length ? new Set() : new Set(meals.map((m) => m.mealId)))}
              className="rounded-full px-3 py-2 text-sm font-semibold text-primary active:bg-primary/10"
            >
              {selected.size === meals.length ? 'Keine' : 'Alle'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <h1 className="text-headline text-text-primary-light dark:text-text-primary-dark">Wochenplan</h1>
            <button type="button" onClick={share} disabled={meals.length === 0} aria-label="Plan teilen" className={iconButton}>
              <span className="material-symbols-outlined text-[20px]">share</span>
            </button>
          </div>
        )}

        <div className={`mt-3 flex items-center justify-between transition-opacity ${selecting ? 'pointer-events-none opacity-40' : ''}`}>
          <button type="button" onClick={() => changeWeek(weekOffset - 1)} aria-label="Vorherige Woche" className={arrowButton}>
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => changeWeek(0)}
            disabled={weekOffset === 0}
            className="flex flex-col items-center leading-tight disabled:cursor-default"
            aria-label={weekOffset === 0 ? undefined : 'Zurück zu dieser Woche'}
          >
            <span className="text-base font-bold text-text-primary-light dark:text-text-primary-dark">{weekLabel(weekOffset, kw)}</span>
            <span className="text-xs text-text-secondary-light dark:text-text-secondary-dark">
              {days[0].toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
              {weekOffset !== 0 && <span className="ml-1.5 font-semibold text-primary">· Heute</span>}
            </span>
          </button>
          <button type="button" onClick={() => changeWeek(weekOffset + 1)} aria-label="Nächste Woche" className={arrowButton}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </header>

      <div
        className={`flex flex-col px-4 transition-opacity duration-200 ${loading ? 'opacity-50' : ''}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {!selecting && !loading && meals.length === 0 && canRepeatPreviousWeek && (
          <button
            type="button"
            onClick={() => {
              onRepeatPreviousWeek();
              void impact('medium');
            }}
            className="mb-1 flex items-center justify-center gap-2 self-center rounded-full border border-solid border-black/10 px-4 py-2 text-sm font-semibold text-text-primary-light transition active:scale-95 dark:border-white/15 dark:text-text-primary-dark"
          >
            <span className="material-symbols-outlined text-[18px]">sync</span>
            Vorwoche übernehmen
          </button>
        )}

        {/* Tage: Datum links, Gerichte rechts, „+“ immer an derselben Stelle. */}
        {days.map((d, i) => {
          const dateStr = dayStrings[i];
          const dayMeals = dayMealsOf(dateStr);
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;
          const addHere = () => onAdd({ date: dateStr, scope: 'day' });
          const emptyTap = dayMeals.length === 0 && !selecting;
          return (
            <section
              key={dateStr}
              className={`flex gap-3 border-b border-solid border-black/5 py-2.5 last:border-b-0 dark:border-white/5 ${emptyTap ? 'cursor-pointer' : ''}`}
              onClick={emptyTap ? addHere : undefined}
              aria-label={longDay(d)}
            >
              <div className={`flex w-10 flex-shrink-0 flex-col items-center pt-0.5 ${isPast ? 'opacity-45' : ''}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wide ${isToday ? 'text-primary' : 'text-text-secondary-light dark:text-text-secondary-dark'}`}>
                  {shortDay(d)}
                </span>
                <span
                  className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base font-bold ${
                    isToday ? 'bg-primary text-white' : 'text-text-primary-light dark:text-text-primary-dark'
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">{dayMeals.map((meal) => renderCard(meal, isPast))}</div>
              <AddButton label={`Gericht für ${longDay(d)} hinzufügen`} hidden={selecting} onClick={addHere} />
            </section>
          );
        })}

        {/* Ohne Tag: Gerichte für „irgendwann diese Woche“. */}
        <section className="mt-2 flex gap-3 rounded-2xl bg-black/[0.03] py-2.5 dark:bg-white/[0.04]">
          <div className="flex w-10 flex-shrink-0 flex-col items-center justify-start pt-1.5 text-text-secondary-light dark:text-text-secondary-dark">
            <span className="material-symbols-outlined text-[22px]">calendar_month</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            <p className="pt-2 text-[11px] font-bold uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark">Ohne festen Tag</p>
            {unscheduled.map((meal) => renderCard(meal, false))}
          </div>
          <AddButton label="Gericht ohne festen Tag hinzufügen" hidden={selecting} onClick={() => onAdd({ date: dayStrings[0], scope: 'week' })} />
        </section>

        {/* Ein Schritt von Plan zu Einkauf; in einer leeren Woche kein grauer Knopf. */}
        {meals.length > 0 && !selecting && (
          <div className="mt-5 flex flex-col items-center gap-2 pb-2">
            {allShopped ? (
              <Link
                to={shoppingPath}
                className="flex items-center gap-2 rounded-full border border-solid border-primary/40 px-5 py-3 text-sm font-semibold text-primary transition active:scale-95"
              >
                <span className="material-symbols-outlined filled text-[20px]">check_circle</span>
                Auf der Einkaufsliste
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onAddToShopping();
                  void impact('medium');
                }}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-neo-light-convex transition active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
                Zutaten einkaufen
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                  {toShopCount} {toShopCount === 1 ? 'Rezept' : 'Rezepte'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation + Platz für den runden „+ Rezept“-Knopf, damit er das letzte „+“ nicht verdeckt. */}
      <div style={{ height: 'calc(var(--nav-height) + var(--safe-area-inset-bottom, 0px) + 4.5rem)' }} className="w-full shrink-0" />

      {selecting && (
        <FloatingBar>
          <div className="flex items-center gap-1 rounded-full bg-card-light p-1.5 shadow-xl shadow-black/15 dark:bg-card-dark">
            <button
              type="button"
              onClick={() => setSheet({ kind: 'move-selected' })}
              className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-text-primary-light active:bg-black/5 dark:text-text-primary-dark"
            >
              <span className="material-symbols-outlined text-[20px]">calendar_month</span>
              Verschieben
            </button>
            <button
              type="button"
              onClick={() => remove(selectedMeals)}
              className="flex items-center gap-2 rounded-full bg-red-500 px-4 py-2.5 text-sm font-semibold text-white active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">delete</span>
              Entfernen
            </button>
          </div>
        </FloatingBar>
      )}

      {/* Rückgängig statt Bestätigungsdialog: Entfernen geht sofort, ein Tipp holt es zurück. */}
      {undo && !selecting && (
        <FloatingBar>
          <div className="flex max-w-sm items-center gap-3 rounded-full bg-[#111718] py-2 pl-4 pr-2 text-sm text-white shadow-lg">
            <span className="truncate">{undo.length === 1 ? `„${undo[0].recipe.title}“ entfernt` : `${undo.length} Gerichte entfernt`}</span>
            <button type="button" onClick={restore} className="rounded-full px-3 py-1.5 font-semibold text-green-300 active:bg-white/10">
              Rückgängig
            </button>
          </div>
        </FloatingBar>
      )}

      {sheet?.kind === 'move-selected' && (
        <BottomSheet title={`${selected.size} ${selected.size === 1 ? 'Gericht' : 'Gerichte'} verschieben`} onClose={() => setSheet(null)}>
          <div className="pb-2">
            <DayGrid days={days} todayStr={todayStr} onPick={(slot) => move(selectedMeals, slot)} />
          </div>
        </BottomSheet>
      )}

      {sheetMeal && (
        <BottomSheet title={sheetMeal.recipe.title} onClose={() => setSheet(null)}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark">Verschieben</p>
          <DayGrid days={days} todayStr={todayStr} current={{ date: sheetMeal.date, scope: sheetMeal.scope }} onPick={(slot) => move([sheetMeal], slot)} />
          <div className="mt-5 flex flex-col gap-1 border-t border-solid border-black/5 pb-2 pt-3 dark:border-white/10">
            <Link
              {...recipeLink(sheetMeal.recipe._id)}
              className="flex items-center gap-3 rounded-xl px-1 py-3 font-semibold text-text-primary-light active:bg-black/5 dark:text-text-primary-dark"
            >
              <span className="material-symbols-outlined text-[22px]">menu_book</span>
              Rezept öffnen
            </Link>
            <button
              type="button"
              onClick={() => remove([sheetMeal])}
              className="flex items-center gap-3 rounded-xl px-1 py-3 text-left font-semibold text-red-600 active:bg-red-50 dark:text-red-400 dark:active:bg-red-900/20"
            >
              <span className="material-symbols-outlined text-[22px]">delete</span>
              Aus dem Plan entfernen
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};

export default WeeklyPlanView;
