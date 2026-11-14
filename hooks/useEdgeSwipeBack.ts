import { useEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from '../components/addRecipe/motion';

/** Startzone am linken Rand wie bei iOS (UINavigationController reagiert etwa auf die ersten 20 pt). */
const EDGE_PX = 24;
/** iOS-artiges Ausrollen: startet mit Fingertempo und läuft weich aus. */
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** Anfangssteigung von EASE_OUT (0.8 / 0.2): Strecke × 4 / Dauer = Starttempo. */
const EASE_START_SLOPE = 4;
const MIN_MS = 180;
const MAX_MS = 320;
const SHADOW = '-10px 0 28px rgba(0, 0, 0, 0.14)';

/** Dauer so wählen, dass die Animation mit dem Tempo des Fingers beginnt (px/ms). */
const settleDuration = (distance: number, speed: number) =>
  Math.round(Math.min(MAX_MS, Math.max(MIN_MS, (EASE_START_SLOPE * distance) / Math.max(speed, 0.01))));

/**
 * Zurück-Wischgeste vom linken Rand wie unter iOS: Die Seite folgt dem Finger, die Herkunftsseite liegt schon
 * fertig gerendert darunter (TabsLayout) und gleitet mit leichter Parallaxe mit. Ab gut einem Drittel der Breite
 * oder bei schnellem Wischen gleitet die Seite hinaus und `onBack` navigiert, sonst federt sie zurück.
 *
 * Berührungen am Rand fängt der Hook in der Capture-Phase ab, bevor das Rezept-Karussell (Embla hört auf
 * `touchstart`/`mousedown`) sie sieht. Weiter innen bleibt alles beim Karussell. Während des Ziehens läuft nichts
 * über React: nur `transform` pro Frame, kein Layout.
 */
export function useEdgeSwipeBack(
  pageRef: RefObject<HTMLElement | null>,
  underRef: RefObject<HTMLElement | null>,
  { enabled, pageKey, onBack }: { enabled: boolean; pageKey: string; onBack: () => void },
) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const page = pageRef.current;
    if (!page || !enabled) return;
    let tracking = false;
    let dragging = false;
    let settling = false;
    let startX = 0;
    let startY = 0;
    let offset = 0;
    let width = 1;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let frame = 0;
    let timer = 0;

    const apply = (x: number, transition = 'none') => {
      page.style.transition = transition;
      page.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
      const under = underRef.current;
      if (under) {
        under.style.transition = transition;
        // Parallaxe wie beim iOS-Navigationsstapel: darunter startet bei -30 % und kommt mit.
        under.style.transform = x ? `translate3d(${Math.round((x / width - 1) * width * 0.3)}px, 0, 0)` : '';
      }
    };

    const prepare = (active: boolean) => {
      const under = underRef.current;
      page.style.willChange = active ? 'transform' : '';
      page.style.boxShadow = active ? SHADOW : '';
      if (under) under.style.willChange = active ? 'transform' : '';
    };

    const clear = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      settling = false;
      apply(0);
      prepare(false);
    };

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1 || touch.clientX > EDGE_PX || settling) {
        tracking = false;
        return;
      }
      // Gehört der Zurück-Geste: das Karussell darf diese Berührung nicht bekommen.
      event.stopPropagation();
      tracking = true;
      dragging = false;
      startX = lastX = touch.clientX;
      startY = touch.clientY;
      lastT = event.timeStamp || performance.now();
      velocity = 0;
      width = page.offsetWidth || window.innerWidth || 1;
    };

    // Maus (Web-Version): Karussell am Rand ebenfalls nicht greifen lassen.
    const onMouseDown = (event: MouseEvent) => {
      if (event.clientX <= EDGE_PX) event.stopPropagation();
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!dragging) {
        // Erst entscheiden, wenn die Richtung klar ist: senkrecht bleibt Scrollen.
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx) || dx <= 0) { tracking = false; return; }
        dragging = true;
        prepare(true);
      }
      event.preventDefault();
      offset = Math.min(width, Math.max(0, dx));
      const now = event.timeStamp || performance.now();
      const dt = now - lastT;
      if (dt > 0) {
        // Geglättet, damit ein einzelner unruhiger Frame die Entscheidung nicht kippt.
        velocity = velocity * 0.4 + ((touch.clientX - lastX) / dt) * 0.6;
        lastX = touch.clientX;
        lastT = now;
      }
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (dragging) apply(offset);
        });
      }
    };

    const onEnd = (event: TouchEvent) => {
      if (!dragging) { tracking = false; return; }
      dragging = false;
      tracking = false;
      cancelAnimationFrame(frame);
      frame = 0;
      // Finger lag vor dem Loslassen still: kein Schwung mehr.
      const now = event.timeStamp || performance.now();
      const speed = now - lastT > 80 ? 0 : velocity;
      const reduced = prefersReducedMotion();
      const commit = event.type !== 'touchcancel' && (speed > 0.5 || (offset > width * 0.35 && speed > -0.2));
      settling = true;

      if (commit) {
        const duration = reduced ? 0 : settleDuration(width - offset, Math.max(speed, 0));
        apply(width, duration ? `transform ${duration}ms ${EASE_OUT}` : 'none');
        timer = window.setTimeout(() => {
          onBackRef.current();
          // Die Route wechselt und die Seite verschwindet; bleibt sie doch (Navigation verhindert), zurücksetzen.
          timer = window.setTimeout(clear, 60);
        }, duration);
      } else {
        const duration = reduced ? 0 : settleDuration(offset, Math.max(-speed, 0));
        apply(0, duration ? `transform ${duration}ms ${EASE_OUT}` : 'none');
        timer = window.setTimeout(clear, duration);
      }
    };

    page.addEventListener('touchstart', onStart, { capture: true, passive: true });
    page.addEventListener('mousedown', onMouseDown, true);
    page.addEventListener('touchmove', onMove, { capture: true, passive: false });
    page.addEventListener('touchend', onEnd, true);
    page.addEventListener('touchcancel', onEnd, true);
    return () => {
      page.removeEventListener('touchstart', onStart, true);
      page.removeEventListener('mousedown', onMouseDown, true);
      page.removeEventListener('touchmove', onMove, true);
      page.removeEventListener('touchend', onEnd, true);
      page.removeEventListener('touchcancel', onEnd, true);
      clear();
    };
  // pageKey: Die Seite wird je Route neu gemountet, die Listener müssen ans neue Element.
  }, [pageRef, underRef, enabled, pageKey]);
}
