import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Kurven und Dauern wie index.css (.sheet-in/.sheet-out): iOS-Sheet-Kurve, Ausblenden schneller als Einblenden. */
export const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const SHEET_OUT_MS = 240;

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Schließen mit Ausblend-Animation: `closing` setzt die .sheet-out/.scrim-out-Klassen, danach `onDone`.
 * Mehrfaches Tippen löst nur ein Schließen aus.
 */
export function useAnimatedClose(onDone: () => void) {
  const [closing, setClosing] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const startedRef = useRef(false);
  const close = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setClosing(true);
    window.setTimeout(() => doneRef.current(), prefersReducedMotion() ? 0 : SHEET_OUT_MS);
  }, []);
  return [closing, close] as const;
}

/** Höhe eines Elements von `from` auf seine aktuelle Höhe gleiten lassen (FLIP), z. B. beim Schrittwechsel im Sheet. */
export const animateHeightFrom = (el: HTMLElement | null, from: number | null) => {
  if (!el || from === null || prefersReducedMotion() || typeof el.animate !== 'function') return;
  const to = el.offsetHeight;
  if (Math.abs(to - from) < 2) return;
  el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 360, easing: SHEET_EASE });
};

/** Liegt das Element (oder ein scrollbarer Vorfahr bis `root`) nicht ganz oben, gehört ein Wischen nach unten dem Scrollen. */
const scrolledAway = (target: Element | null, root: Element) => {
  for (let node = target; node && node !== root; node = node.parentElement) {
    if (node.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) return true;
  }
  return false;
};

/**
 * Bottom-Sheet nach unten wegwischen wie unter iOS: Das Sheet folgt dem Finger, die Abdunklung blendet mit.
 * Schließt ab einem Drittel der Höhe oder bei schnellem Wischen, sonst federt es zurück. Wischen in
 * scrollbarem Inhalt bleibt Scrollen, solange der Inhalt nicht oben ist; Eingabefelder sind ausgenommen.
 * `onDismissed` kommt nach der eigenen Ausblend-Bewegung (ohne zusätzliche .sheet-out-Animation).
 */
export function useDragToDismiss(
  sheetRef: RefObject<HTMLElement | null>,
  scrimRef: RefObject<HTMLElement | null>,
  onDismissed: () => void,
  enabled = true,
) {
  const dismissRef = useRef(onDismissed);
  dismissRef.current = onDismissed;
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !enabled) return;
    let tracking = false;
    let dragging = false;
    let startY = 0;
    let offset = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;

    const setScrim = (value: string, transition = 'none') => {
      const scrim = scrimRef.current;
      if (!scrim) return;
      scrim.style.transition = transition;
      scrim.style.opacity = value;
    };

    const onStart = (event: TouchEvent) => {
      const target = event.target as Element;
      tracking = event.touches.length === 1 && !target.closest('input, textarea, select, [data-no-drag]') && !scrolledAway(target, sheet);
      dragging = false;
      startY = lastY = event.touches[0]?.clientY ?? 0;
      lastT = performance.now();
      offset = 0;
      velocity = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const y = event.touches[0].clientY;
      const delta = y - startY;
      if (!dragging) {
        if (delta < -4) { tracking = false; return; }
        if (delta < 8) return;
        dragging = true;
        // Einblend-Animationen beenden, sonst überschreiben sie die Finger-Position.
        sheet.getAnimations().forEach((animation) => animation.cancel());
        scrimRef.current?.getAnimations().forEach((animation) => animation.cancel());
        sheet.style.transition = 'none';
      }
      event.preventDefault();
      offset = Math.max(0, delta - 8);
      const now = performance.now();
      velocity = (y - lastY) / Math.max(1, now - lastT);
      lastY = y;
      lastT = now;
      sheet.style.transform = `translate3d(0, ${offset}px, 0)`;
      setScrim(String(Math.max(0, 1 - offset / Math.max(1, sheet.offsetHeight))));
    };

    const onEnd = () => {
      if (!dragging) { tracking = false; return; }
      dragging = false;
      tracking = false;
      if (offset > sheet.offsetHeight / 3 || velocity > 0.5) {
        sheet.style.transition = 'transform 220ms cubic-bezier(0.32, 0, 0.67, 0)';
        sheet.style.transform = 'translate3d(0, 100%, 0)';
        setScrim('0', 'opacity 220ms ease-in');
        window.setTimeout(() => dismissRef.current(), 210);
      } else {
        sheet.style.transition = `transform 380ms ${SHEET_EASE}`;
        sheet.style.transform = 'translate3d(0, 0, 0)';
        setScrim('1', 'opacity 380ms ease-out');
      }
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [sheetRef, scrimRef, enabled]);
}
