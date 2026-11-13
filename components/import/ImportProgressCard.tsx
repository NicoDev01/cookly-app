import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ONB_IMG } from '../onboarding/onboardingData';
import { IMPORT_STEP_TARGET, approachPercent, type ImportStepId } from '../../utils/importProgress';

const FADE_OUT_MS = 220;
const TICK_MS = 120;

/** Blendet alten Text erst aus, dann den neuen ein (nacheinander, nicht überlappend). */
const FadeSwap: React.FC<{ text: string }> = ({ text }) => {
  const [shown, setShown] = useState(text);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (text === shown) return;
    setVisible(false);
    const id = window.setTimeout(() => {
      setShown(text);
      setVisible(true);
    }, FADE_OUT_MS);
    return () => window.clearTimeout(id);
  }, [text, shown]);

  return <span className={`imp-swap-text ${visible ? 'is-in' : 'is-out'}`}>{shown}</span>;
};

/**
 * Prozentwert ohne Sprünge: Bei jedem Schrittwechsel startet der neue Schritt dort, wo der Balken stand,
 * und nähert sich seinem Ziel nur an (utils/importProgress.ts).
 */
/** Letzter Stand je Import: Wird die Seite neu gemountet (doppelter Share-Intent), läuft der Balken weiter statt ab 0. */
let carried: { key: string; percent: number } | null = null;

const useStepPercent = (step: ImportStepId, expectedMs: number, done: boolean, progressKey?: string) => {
  const initial = progressKey && carried?.key === progressKey ? carried.percent : 0;
  const [percent, setPercent] = useState(initial);
  const percentRef = useRef(initial);
  useEffect(() => {
    if (done) return;
    const base = percentRef.current;
    const startedAt = Date.now();
    const tick = () => {
      const next = approachPercent(base, IMPORT_STEP_TARGET[step], Date.now() - startedAt, expectedMs);
      percentRef.current = next;
      if (progressKey) carried = { key: progressKey, percent: next };
      setPercent(next);
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [step, expectedMs, done, progressKey]);

  return done ? 100 : percent;
};

/**
 * Schwebende Fortschritts-Card über der entstehenden Rezeptseite: Maskottchen, Schritt, Balken, 0–100 %.
 * Die Unterzeile sagt nur, dass man die App verlassen kann; woher der Nutzer kam, wissen wir nicht.
 * Liegt per Portal direkt im body: Der Seiten-Container (TabsLayout, .page-enter) hat ein transform,
 * darin würde `fixed` mitscrollen statt am unteren Rand zu bleiben.
 */
const ImportProgressCard: React.FC<{
  step: ImportStepId;
  title: string;
  expectedMs: number;
  done: boolean;
  slow: boolean;
  category?: string;
  leaving: boolean;
  /** Ohne Einflug-Animation, z. B. wenn die Seite für denselben Import neu gemountet wurde. */
  instant?: boolean;
  /** Schlüssel des Imports, damit der Prozentwert einen Neu-Mount übersteht. */
  progressKey?: string;
  /** Eigener Fortschritt (0–100), z. B. Foto-Scan mehrerer Rezepte; ersetzt die Schätzung aus `step`. */
  percent?: number;
  /** Überschrift im fertigen Zustand (Standard: „Rezept ist fertig!“). */
  doneTitle?: string;
  /** Abstand nach unten, z. B. über der Tab-Leiste. */
  bottom?: string;
}> = ({ step, title, expectedMs, done, slow, category, leaving, instant, progressKey, percent: percentOverride, doneTitle, bottom }) => {
  const estimated = useStepPercent(step, expectedMs, done || percentOverride !== undefined, progressKey);
  const percent = done ? 100 : percentOverride ?? estimated;
  const subtitle = done
    ? category ? `Gespeichert in „${category}“.` : 'Gespeichert in deinem Kochbuch.'
    : slow
      ? 'Dauert gerade etwas länger. Du kannst jederzeit zurück.'
      : 'Läuft im Hintergrund – du kannst jederzeit zurück.';

  return createPortal(
    <div
      className={`imp-card pointer-events-none fixed inset-x-3 z-[60] mx-auto max-w-md ${instant ? 'imp-card--instant' : ''} ${leaving ? 'imp-card--leave' : ''}`}
      style={{ bottom: bottom ?? 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto rounded-[24px] border border-black/[0.05] bg-white px-4 py-3.5 shadow-[0_20px_44px_-18px_rgba(20,40,30,0.45),0_2px_6px_rgba(20,40,30,0.06)]">
        <div className="flex items-center gap-3">
          <div className="relative size-14 shrink-0">
            <span key={done ? 'done' : step} className="imp-hop block size-14">
              <img src={done ? ONB_IMG.nice : ONB_IMG.setup} alt="" className={`size-14 object-contain ${done ? '' : 'imp-bob'}`} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-extrabold leading-tight tracking-tight text-[#111718]">
              <FadeSwap text={done ? doneTitle ?? 'Rezept ist fertig!' : title} />
            </p>
            <p className="mt-0.5 text-[13px] font-medium leading-[17px] text-gray-500">
              <FadeSwap text={subtitle} />
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-4 flex-1 overflow-hidden rounded-full bg-card-light"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.floor(percent)}
          >
            <div
              className={`imp-fill h-full rounded-full bg-primary ${done ? 'imp-fill--done' : ''}`}
              style={{ width: `${Math.max(4, percent)}%` }}
            />
          </div>
          <div className="flex w-[52px] shrink-0 justify-end">
            {done ? (
              <span className="imp-pop material-symbols-outlined filled !text-[28px] leading-none text-primary">check_circle</span>
            ) : (
              <span className="text-[20px] font-black leading-none tabular-nums tracking-tight text-[#111718]">
                {Math.floor(percent)}
                <span className="text-[13px] font-extrabold text-gray-400">%</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ImportProgressCard;
