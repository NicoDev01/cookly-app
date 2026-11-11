/**
 * Einkaufsliste (Konzept 09.11.2026, im Labor als v1 entstanden). Reine Darstellung: Daten und Speichern kommen von
 * außen, damit App (Convex) und Labor (Testdaten) dieselbe Ansicht nutzen.
 * - Pastell-Pills wie bisher; Abhaken streicht durch, nichts springt.
 * - Schnelleingabe („2 Zwiebeln“) mit Vorschlägen aus „zuletzt gekauft“ (nur auf dem Gerät gespeichert).
 * - „Abteilungen“ mit Überschrift oder „Rezepte“ mit Rezeptbild; gleiche Zutaten = eine Pill, Mengen addiert.
 * - Halten: Bearbeiten / Entfernen. ⋮: Erledigte entfernen / Liste leeren. Entfernen wirkt sofort, ohne Rückgängig-Leiste.
 * - Display bleibt an, sobald man abhakt (= man steht im Laden), bis man den Tab verlässt.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeepAwake } from '@capacitor-community/keep-awake';
import ImageWithBlurhash from '../ImageWithBlurhash';
import { iconButton, inputClass, inputIcon, inputShell, sheetButton } from '../ui/tabStyles';
import BottomSheet from '../weekly/BottomSheet';
import { ONB_IMG } from '../onboarding/onboardingData';
import { useHaptic } from '../../hooks/useHaptic';
import { useLongPress } from '../../hooks/useLongPress';
import { useNotification } from '../../contexts/NotificationContext';
import {
  formatAmounts,
  groupByRecipe,
  groupBySection,
  mergeRows,
  parseQuickAdd,
  shareText,
  suggest,
  type ShoppingListViewItem,
  type ShoppingRow,
} from '../../utils/shoppingListView';

export type ShoppingMode = 'sections' | 'recipes';

export type ShoppingRecipePreview = {
  _id: string;
  title: string;
  image?: string;
  thumbnail?: string;
  imageBlurhash?: string;
  sourceImageUrl?: string;
};

type Props = {
  /** `undefined` = lädt noch. */
  items: ShoppingListViewItem[] | undefined;
  /** Rezeptbilder; nur für „Rezepte“ und das Halten-Menü nötig, darf fehlen. */
  recipes?: ShoppingRecipePreview[];
  mode: ShoppingMode;
  onModeChange: (mode: ShoppingMode) => void;
  onSetChecked: (ids: string[], checked: boolean) => void;
  onQuickAdd: (name: string, amount?: string) => void;
  onUpdate: (id: string, name: string, amount?: string) => void;
  onRemove: (items: ShoppingListViewItem[]) => void;
  emptyPath: string;
  /** localStorage-Schlüssel für „zuletzt gekauft“; das Labor nutzt einen eigenen. */
  recentsKey: string;
  initialRecents?: string[];
};

const MAX_RECENTS = 30;

const readRecents = (key: string, fallback: string[]): string[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : fallback;
  } catch {
    return fallback;
  }
};
const writeRecents = (key: string, list: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Privater Modus o. Ä.: Vorschläge sind nur Komfort.
  }
};

const colorClass = (index: number) => `bg-ingredient-${(index % 10) + 1}-bg`;

const RecipeThumb: React.FC<{ recipe?: ShoppingRecipePreview }> = ({ recipe }) => {
  const src = recipe?.image || recipe?.sourceImageUrl;
  return src ? (
    <ImageWithBlurhash src={src} thumbnail={recipe?.thumbnail} blurhash={recipe?.imageBlurhash} alt={recipe?.title ?? ''} className="h-7 w-7 flex-shrink-0 rounded-full" />
  ) : (
    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white">
      <span className="material-symbols-outlined text-[15px]">restaurant</span>
    </span>
  );
};

/** Pill wie bisher; Tippen hakt ab, Halten öffnet das Menü für diesen Eintrag. */
const Pill: React.FC<{ row: ShoppingRow; color: string; fresh: boolean; onToggle: () => void; onLongPress: () => void }> = ({
  row,
  color,
  fresh,
  onToggle,
  onLongPress,
}) => {
  const { handlers, consumeLongPress } = useLongPress(onLongPress);
  const amount = formatAmounts(row);

  return (
    <button
      type="button"
      {...handlers}
      onClick={() => {
        if (!consumeLongPress()) onToggle();
      }}
      style={{ WebkitTouchCallout: 'none' }}
      aria-pressed={row.checked}
      className={
        `relative cursor-pointer select-none appearance-none border-0 transition-all duration-300 ease-out active:scale-95 ` +
        `rounded-full px-3 py-1.5 text-sm font-medium ${color} text-black shadow-neomorphism-pill dark:text-white dark:shadow-dark-neomorphism-pill ` +
        `${row.checked ? 'opacity-45 line-through decoration-2' : ''} ${fresh ? 'animate-in zoom-in-75 duration-300 ring-2 ring-primary' : ''}`
      }
    >
      {amount && <span className="font-normal opacity-70">{amount} </span>}
      {row.name}
    </button>
  );
};

const ShoppingListView: React.FC<Props> = ({
  items,
  recipes,
  mode,
  onModeChange,
  onSetChecked,
  onQuickAdd,
  onUpdate,
  onRemove,
  emptyPath,
  recentsKey,
  initialRecents = [],
}) => {
  const { impact } = useHaptic();
  const { showToast } = useNotification();
  const [draft, setDraft] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [recents, setRecents] = useState<string[]>(() => readRecents(recentsKey, initialRecents));
  const [fresh, setFresh] = useState<string | null>(null);
  const [menu, setMenu] = useState<'list' | ShoppingRow | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [shopping, setShopping] = useState(false);
  const freshTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(freshTimer.current);
    },
    [],
  );

  // Erst beim ersten Abhaken: Dann steht man im Laden. Beim Verlassen des Tabs darf das Display wieder aus.
  useEffect(() => {
    if (!shopping) return;
    KeepAwake.isSupported()
      .then(({ isSupported }) => (isSupported ? KeepAwake.keepAwake() : undefined))
      .catch(() => undefined);
    return () => {
      KeepAwake.allowSleep().catch(() => undefined);
    };
  }, [shopping]);

  const list = useMemo(() => items ?? [], [items]);
  const rows = useMemo(() => mergeRows(list), [list]);
  const recipeById = useMemo(() => new Map((recipes ?? []).map((r) => [r._id, r])), [recipes]);
  const openCount = rows.filter((r) => !r.checked).length;
  const doneCount = rows.length - openCount;
  const checkedItems = list.filter((i) => i.checked);
  // Reihenfolge bleibt fest: Abgehaktes wird nur durchgestrichen, nichts springt.
  const groups = mode === 'sections' ? groupBySection(rows) : groupByRecipe(list);
  // Nach Abteilung laufen die Farben über alle Gruppen weiter, sonst zeigen kleine Abteilungen immer nur die ersten Farben.
  // Nach Rezept beginnt jede Gruppe neu, passend zur Rezeptseite.
  const colorOffsets = groups.reduce<number[]>((offsets, group, i) => [...offsets, i === 0 ? 0 : offsets[i - 1] + groups[i - 1].rows.length], []);
  const suggestions = inputFocused ? suggest(draft, recents, rows) : [];

  const remember = (names: string[]) => {
    setRecents((prev) => {
      const keys = new Set(names.map((n) => n.toLowerCase()));
      const next = [...names, ...prev.filter((n) => !keys.has(n.toLowerCase()))].slice(0, MAX_RECENTS);
      writeRecents(recentsKey, next);
      return next;
    });
  };

  const flash = (key: string) => {
    setFresh(key);
    window.clearTimeout(freshTimer.current);
    freshTimer.current = window.setTimeout(() => setFresh(null), 1500);
  };

  const toggle = (row: ShoppingRow) => {
    const next = !row.checked;
    onSetChecked(row.ids, next);
    void impact(next ? 'medium' : 'light');
    if (next) {
      setShopping(true);
      remember([row.name]);
    }
  };

  const removeItems = (removed: ShoppingListViewItem[]) => {
    setMenu(null);
    if (removed.length === 0) return;
    remember(removed.map((i) => i.name));
    onRemove(removed);
    void impact('medium');
  };

  /**
   * Steht die Zutat schon auf der Liste, wird sie nur wieder geöffnet bzw. hervorgehoben statt doppelt angelegt (wie AnyList).
   * Mit Menge („2 Eier“) kommt ein eigener Eintrag dazu, die Pill rechnet die Mengen zusammen.
   */
  const add = (text: string) => {
    const parsed = parseQuickAdd(text);
    if (!parsed) return;
    const key = parsed.name.toLowerCase();
    const existing = rows.find((r) => r.key === key);
    if (existing && !parsed.amount) {
      if (existing.checked) onSetChecked(existing.ids, false);
    } else onQuickAdd(parsed.name, parsed.amount);
    setDraft('');
    flash(key);
    void impact('light');
  };

  const saveEdit = (row: ShoppingRow) => {
    const parsed = parseQuickAdd(editDraft);
    if (!parsed) return;
    onUpdate(row.ids[0], parsed.name, parsed.amount);
    setMenu(null);
    flash(parsed.name.toLowerCase());
  };

  const share = async () => {
    const text = shareText(rows);
    try {
      if (navigator.share) await navigator.share({ title: 'Einkaufsliste', text });
      else {
        await navigator.clipboard.writeText(text);
        showToast('Liste kopiert.', 'success');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showToast('Teilen hat nicht geklappt.', 'error');
    }
  };

  const rowMenu = menu && menu !== 'list' ? menu : null;
  const singleRecipeTitle = rowMenu?.ids.length === 1 ? list.find((i) => i._id === rowMenu.ids[0])?.recipeTitle : undefined;

  return (
    <div className="page-enter relative flex w-full flex-col overflow-x-hidden bg-background-light font-display dark:bg-background-dark">
      <header className="px-6 pb-2" style={{ paddingTop: 'calc(var(--safe-area-inset-top, 0px) + 0.75rem)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-headline text-text-primary-light dark:text-text-primary-dark">Einkaufsliste</h1>
            {rows.length > 0 && (
              <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
                {openCount === 0 ? 'Alles erledigt' : `${openCount} offen`}
                {openCount > 0 && doneCount > 0 && ` · ${doneCount} erledigt`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={share} disabled={openCount === 0} aria-label="Liste teilen" className={iconButton}>
              <span className="material-symbols-outlined text-[20px]">share</span>
            </button>
            <button type="button" onClick={() => setMenu('list')} disabled={list.length === 0} aria-label="Weitere Aktionen" className={iconButton}>
              <span className="material-symbols-outlined text-[20px]">more_vert</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-6 pt-2">
        {/* Schnelleingabe: das Häufigste zuerst, wie bei jeder Einkaufslisten-App. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add(draft);
          }}
          className={`${inputShell} pl-4`}
        >
          <span className={inputIcon}>add</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Hinzufügen, z. B. 2 Zwiebeln"
            enterKeyHint="done"
            autoCapitalize="sentences"
            maxLength={120}
            className={inputClass}
            aria-label="Eintrag hinzufügen"
          />
          {draft.trim() && (
            <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white animate-in fade-in zoom-in-95 duration-150 active:scale-95">
              Hinzufügen
            </button>
          )}
        </form>

        {/* Vorschläge nur bei offenem Feld; pointerdown verhindert, dass die Tastatur zugeht. */}
        {suggestions.length > 0 && (
          <div className="-mx-6 -mt-1 flex gap-2 overflow-x-auto px-6 pb-1 scrollbar-hide animate-in fade-in duration-150" aria-label="Vorschläge">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => add(name)}
                className="flex flex-shrink-0 items-center gap-1 rounded-full border border-solid border-black/10 px-3 py-1.5 text-sm font-medium text-text-primary-light active:scale-95 dark:border-white/15 dark:text-text-primary-dark"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">add</span>
                {name}
              </button>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex self-start rounded-full bg-black/5 p-1 dark:bg-white/10" role="tablist" aria-label="Sortierung">
            {(
              [
                ['sections', 'Abteilungen'],
                ['recipes', 'Rezepte'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => onModeChange(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  mode === key ? 'bg-card-light text-text-primary-light shadow-sm dark:bg-card-dark dark:text-text-primary-dark' : 'text-text-secondary-light dark:text-text-secondary-dark'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {groups.map((group, groupIndex) => {
          const open = group.rows.filter((r) => !r.checked).length;
          const colorStart = mode === 'sections' ? colorOffsets[groupIndex] : 0;
          return (
            <section key={group.key} className={`transition-opacity duration-300 ${open === 0 ? 'opacity-60' : ''}`}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-secondary-light dark:text-text-secondary-dark">
                {group.recipeId ? (
                  <RecipeThumb recipe={recipeById.get(group.recipeId)} />
                ) : (
                  <span className="text-base leading-none" aria-hidden>
                    {group.emoji ?? '✏️'}
                  </span>
                )}
                <span className="min-w-0 truncate">{group.title}</span>
                {open === 0 && <span className="material-symbols-outlined filled text-[16px] text-primary">check_circle</span>}
              </h2>
              <div className="flex flex-wrap gap-2.5">
                {group.rows.map((row, index) => (
                  <Pill
                    key={row.ids.join()}
                    row={row}
                    color={colorClass(colorStart + index)}
                    fresh={fresh === row.key}
                    onToggle={() => toggle(row)}
                    onLongPress={() => {
                      setMenu(row);
                      setEditDraft([formatAmounts(row), row.name].filter(Boolean).join(' '));
                      void impact('medium');
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {doneCount > 0 && (
          <button
            type="button"
            onClick={() => removeItems(checkedItems)}
            className="mt-1 flex items-center gap-2 self-center rounded-full border border-solid border-black/10 px-4 py-2 text-sm font-semibold text-text-primary-light transition active:scale-95 dark:border-white/15 dark:text-text-primary-dark"
          >
            <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
            {openCount === 0 ? 'Liste leeren' : `Erledigte entfernen (${doneCount})`}
          </button>
        )}

        {items && items.length === 0 && (
          <div className="flex flex-col items-center px-6 pt-10 text-center animate-in fade-in">
            <img src={ONB_IMG.account} alt="" className="h-auto w-48 object-contain" />
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-text-primary-light dark:text-text-primary-dark">
              Noch keine Zutaten in deiner <span className="italic text-primary">Einkaufsliste</span>
            </h2>
            <p className="mt-2 max-w-xs text-sm text-text-secondary-light dark:text-text-secondary-dark">Tippe oben eine Zutat ein oder füge Zutaten aus deinen Rezepten hinzu.</p>
            <Link
              to={emptyPath}
              className="mt-6 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-neo-light-convex transition active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">menu_book</span>
              Zu deinen Rezepten
            </Link>
          </div>
        )}
      </div>

      {/* Navigation + Platz für den runden „+ Rezept“-Knopf und die schwebende Leiste darüber. */}
      <div style={{ height: 'calc(var(--nav-height) + var(--safe-area-inset-bottom, 0px) + 8rem)' }} className="w-full shrink-0" />


      {menu === 'list' && (
        <BottomSheet title="Einkaufsliste" onClose={() => setMenu(null)}>
          <div className="flex flex-col gap-1 pb-2">
            <button type="button" disabled={doneCount === 0} onClick={() => removeItems(checkedItems)} className={sheetButton}>
              <span className="material-symbols-outlined text-[22px]">check_circle</span>
              Erledigte entfernen
              {doneCount > 0 && <span className="ml-auto text-sm text-text-secondary-light dark:text-text-secondary-dark">{doneCount}</span>}
            </button>
            <button type="button" onClick={() => removeItems(list)} className={`${sheetButton} !text-red-500 active:!bg-red-500/10`}>
              <span className="material-symbols-outlined text-[22px]">delete_sweep</span>
              Ganze Liste leeren
            </button>
          </div>
        </BottomSheet>
      )}

      {rowMenu && (
        <BottomSheet
          title={rowMenu.name}
          subtitle={singleRecipeTitle ? `Für ${singleRecipeTitle}` : undefined}
          onClose={() => setMenu(null)}
        >
          {/* Bearbeiten nur bei einem einzelnen Eintrag; zusammengefasste Pills zeigen stattdessen die Mengen je Rezept. */}
          {rowMenu.ids.length === 1 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveEdit(rowMenu);
              }}
              className={`${inputShell} mb-3 pl-2`}
            >
              <input
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                enterKeyHint="done"
                maxLength={120}
                aria-label="Menge und Name"
                className={inputClass}
              />
              <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
                Speichern
              </button>
            </form>
          ) : (
            <ul className="mb-3 flex flex-col gap-1.5">
              {list
                .filter((i) => rowMenu.ids.includes(i._id))
                .map((i) => (
                  <li key={i._id} className="flex items-center gap-2 text-sm text-text-primary-light dark:text-text-primary-dark">
                    {i.recipeId ? <RecipeThumb recipe={recipeById.get(i.recipeId)} /> : <span className="w-7 text-center">✏️</span>}
                    <span className="min-w-0 flex-1 truncate">{i.recipeTitle ?? 'Eigener Eintrag'}</span>
                    <span className="text-text-secondary-light dark:text-text-secondary-dark">{i.amount}</span>
                  </li>
                ))}
            </ul>
          )}
          <div className="flex flex-col gap-1 pb-2">
            <button
              type="button"
              onClick={() => {
                const ids = new Set(rowMenu.ids);
                removeItems(list.filter((i) => ids.has(i._id)));
              }}
              className={`${sheetButton} !text-red-500 active:!bg-red-500/10`}
            >
              <span className="material-symbols-outlined text-[22px]">delete</span>
              Entfernen
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};

export default ShoppingListView;
