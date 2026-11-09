import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, Flame, Timer, X } from 'lucide-react';
import { KeepAwake } from '@capacitor-community/keep-awake';
import type { Ingredient, Instruction } from '../types';
import { buildCookSteps } from '../utils/cookText';
import CookTimerPills from './CookTimerPills';
import type { CookTimersApi } from '../hooks/useCookTimers';
import { registerBackButtonOverride } from '../services/backButtonOverride';

/**
 * Kochmodus: Schritte untereinander, der aktuelle groß in der Mitte, davor und danach blass.
 * Scrollen rastet auf den nächsten Schritt ein; „Weiter“ macht dasselbe. Nach dem letzten Schritt: „Guten Appetit“.
 * Timer leben in der Rezeptseite weiter, wenn der Kochmodus geschlossen wird.
 */

interface CookModeProps {
  title: string;
  instructions: Instruction[];
  /** Bereits auf die gewählten Portionen umgerechnet. */
  ingredients: Ingredient[];
  timers: CookTimersApi;
  /** Hier geht es weiter (zuletzt offener Schritt oder Schritt eines Timers). */
  initialStep: number;
  onStepChange: (step: number) => void;
  /** X oben: schließen, Stand bleibt. */
  onClose: () => void;
  /** „Kochen beenden“ am Ende: Stand zurücksetzen. */
  onFinish: () => void;
}

const COLORS = [
  'bg-ingredient-1-bg', 'bg-ingredient-2-bg', 'bg-ingredient-3-bg',
  'bg-ingredient-4-bg', 'bg-ingredient-5-bg', 'bg-ingredient-6-bg',
  'bg-ingredient-7-bg', 'bg-ingredient-8-bg', 'bg-ingredient-9-bg',
  'bg-ingredient-10-bg',
];

const CookMode: React.FC<CookModeProps> = ({ title, instructions, ingredients, timers, initialStep, onStepChange, onClose, onFinish }) => {
  const steps = useMemo(() => instructions.map((s) => (typeof s?.text === 'string' ? s.text : String(s?.text ?? ''))), [instructions]);
  const cook = useMemo(() => buildCookSteps(steps, ingredients), [steps, ingredients]);
  /** Letzter Eintrag der Liste = Abschluss „Guten Appetit“. */
  const finishIndex = steps.length;
  const [step, setStep] = useState(() => Math.min(Math.max(0, initialStep), finishIndex));
  const isFinish = step === finishIndex;
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const scrollToItem = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const box = scrollRef.current;
    const target = itemRefs.current[Math.min(finishIndex, Math.max(0, index))];
    if (!box || !target) return;
    box.scrollTo({ top: target.offsetTop - (box.clientHeight - target.offsetHeight) / 2, behavior });
  }, [finishIndex]);
  const go = useCallback((delta: 1 | -1) => scrollToItem(step + delta), [scrollToItem, step]);

  // Beim Öffnen ohne Animation dort weitermachen, wo man war.
  const initial = useRef(step);
  useLayoutEffect(() => { scrollToItem(initial.current, 'auto'); }, [scrollToItem]);

  useEffect(() => { onStepChange(step); }, [step, onStepChange]);

  // Aktiver Eintrag = der, dessen Mitte der Mitte des Scrollbereichs am nächsten ist.
  const onScroll = useCallback(() => {
    const box = scrollRef.current?.getBoundingClientRect();
    if (!box) return;
    const center = box.top + box.height / 2;
    let best = 0;
    let bestDist = Infinity;
    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.top + r.height / 2 - center);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    setStep(best);
  }, []);

  // Tastatur: Pfeile blättern, Escape schließt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Android-Zurück schließt den Kochmodus statt die Rezeptseite.
  useEffect(() => registerBackButtonOverride(onClose), [onClose]);

  // Bildschirm bleibt an, solange der Kochmodus offen ist (nativ per Plugin, im Browser per Wake Lock).
  useEffect(() => {
    KeepAwake.isSupported()
      .then(({ isSupported }) => (isSupported ? KeepAwake.keepAwake() : undefined))
      .catch(() => undefined);
    return () => { KeepAwake.allowSleep().catch(() => undefined); };
  }, []);

  // Seite dahinter nicht mitscrollen.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const progress = steps.length ? Math.min(step + 1, steps.length) / steps.length : 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Kochmodus: ${title}`}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-white font-display text-[#111718] dark:bg-background-dark dark:text-white"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Fortschritt */}
      <div className="h-[3px] w-full bg-gray-100 dark:bg-white/10">
        <div className="h-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Kopf: Schrittzahl, laufende Timer, Schließen */}
      <div className="flex min-h-[60px] items-center gap-2 px-5">
        <span className="w-14 shrink-0 text-xl font-semibold tabular-nums text-[#111718] dark:text-white" aria-live="polite">
          {Math.min(step + 1, steps.length)}/{steps.length}
        </span>
        <CookTimerPills
          className="flex-1 justify-center"
          timers={timers.timers}
          now={timers.now}
          onToggle={timers.toggle}
          onRemove={timers.remove}
          onSelect={(t) => scrollToItem(t.step)}
        />
        <div className="flex w-14 shrink-0 justify-end">
          <button
            type="button"
            aria-label="Kochmodus schließen"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-[#111718] transition active:scale-95 hover:bg-gray-200 dark:bg-white/10 dark:text-white"
          >
            <X size={20} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>

      {/* Schritte: aktueller in der Mitte, Nachbarn blass als Vorschau */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-none px-6 scrollbar-hide"
        style={{ maskImage: 'linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)' }}
      >
        {/* Platz oben und unten, damit auch der erste und letzte Eintrag mittig stehen können */}
        <div className="h-[35dvh]" aria-hidden />
        {cook.segments.map((segs, index) => {
          const active = index === step;
          return (
            <section
              key={index}
              ref={(el) => { itemRefs.current[index] = el; }}
              onClick={active ? undefined : () => scrollToItem(index)}
              aria-current={active ? 'step' : undefined}
              className={`snap-center py-7 transition-opacity duration-300 ${active ? 'opacity-100' : 'cursor-pointer opacity-20'}`}
            >
              {index === 0 && cook.ovenHint && (
                <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                  <Flame size={15} strokeWidth={2.25} aria-hidden />
                  {cook.ovenHint}
                </p>
              )}
              {/* Lange Wörter umbrechen statt über den Rand zu laufen (sonst ließ sich seitlich scrollen). */}
              <p className={`hyphens-auto break-words text-[22px] font-medium leading-[1.55] tracking-tight [overflow-wrap:anywhere] ${active ? '' : 'pointer-events-none'}`}>
                {segs.map((seg, i) => {
                  if (seg.kind === 'text') return <React.Fragment key={i}>{seg.text}</React.Fragment>;
                  if (seg.kind === 'ingredient') {
                    return (
                      <React.Fragment key={i}>
                        {seg.amount && <span className="mr-1.5 whitespace-nowrap font-semibold">{seg.amount}</span>}
                        <span className={`rounded-full px-1.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone] ${COLORS[seg.index % COLORS.length]}`}>{seg.text}</span>
                      </React.Fragment>
                    );
                  }
                  if (seg.kind === 'heat') {
                    return (
                      <span key={i} className="whitespace-nowrap font-semibold text-orange-700 dark:text-orange-300">
                        <Flame size={18} strokeWidth={2.25} className="mr-0.5 inline-block -translate-y-0.5" aria-hidden />
                        {seg.text}
                      </span>
                    );
                  }
                  const timerId = `${index}-${i}`;
                  const running = timers.timers.some((t) => t.id === timerId);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => timers.start(timerId, cook.labels[index], index, seg.seconds)}
                      aria-label={running ? `${seg.text}, Timer läuft` : `Timer starten: ${seg.text}`}
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-solid px-2 leading-[1.25] align-baseline font-bold transition-colors active:scale-95 ${running ? 'border-primary bg-primary text-[#111718]' : 'border-[#111718]/25 hover:bg-black/5 dark:border-white/30 dark:hover:bg-white/10'}`}
                    >
                      <Timer size={16} strokeWidth={2.5} className="self-center" aria-hidden />
                      {seg.text}
                    </button>
                  );
                })}
              </p>
            </section>
          );
        })}

        {/* Abschluss */}
        <section
          ref={(el) => { itemRefs.current[finishIndex] = el; }}
          onClick={isFinish ? undefined : () => scrollToItem(finishIndex)}
          className={`snap-center py-10 text-center transition-opacity duration-300 ${isFinish ? 'opacity-100' : 'cursor-pointer opacity-20'}`}
        >
          <p className="text-[30px] font-semibold tracking-tight">Fertig.</p>
          <p className="mt-1 text-xl text-gray-500 dark:text-gray-400">Guten Appetit!</p>
        </section>
        <div className="h-[35dvh]" aria-hidden />
      </div>

      {/* Fuß: Zurück, Weiter bzw. Kochen beenden */}
      <div className="px-5 pb-5 pt-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Vorheriger Schritt"
            onClick={() => go(-1)}
            disabled={step === 0}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100 transition active:scale-95 disabled:opacity-30 dark:bg-white/10"
          >
            <ChevronUp size={24} strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            onClick={isFinish ? onFinish : () => go(1)}
            className="h-14 flex-1 rounded-full bg-primary text-base font-semibold text-[#111718] transition active:scale-[0.98]"
          >
            {isFinish ? 'Kochen beenden' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CookMode;
