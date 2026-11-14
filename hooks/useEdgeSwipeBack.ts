import { useEffect, useRef, type RefObject } from 'react';
import { SHEET_EASE, prefersReducedMotion } from '../components/addRecipe/motion';

/** Startzone am linken Rand wie bei iOS (UINavigationController reagiert etwa auf die ersten 20 pt). */
const EDGE_PX = 24;

/**
 * Zurück-Wischgeste vom linken Rand wie unter iOS: Die Seite folgt dem Finger, darunter wird die Herkunftsseite
 * sichtbar (`onPeek(true)`). Ab etwa einem Drittel der Breite oder bei schnellem Wischen gleitet sie hinaus und
 * `onBack` navigiert, sonst federt sie zurück. Startet die Berührung am Rand, bekommt das Rezept-Karussell
 * (Embla, Pointer-Events) sie nicht mit.
 */
export function useEdgeSwipeBack(
  pageRef: RefObject<HTMLElement | null>,
  underRef: RefObject<HTMLElement | null>,
  { enabled, pageKey, onPeek, onBack }: { enabled: boolean; pageKey: string; onPeek: (visible: boolean) => void; onBack: () => void },
) {
  const callbacks = useRef({ onPeek, onBack });
  callbacks.current = { onPeek, onBack };

  useEffect(() => {
    const page = pageRef.current;
    if (!page || !enabled) return;
    let tracking = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let offset = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;

    const style = (x: number, transition = 'none') => {
      const width = page.offsetWidth || 1;
      page.style.transition = transition;
      page.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
      page.style.boxShadow = x ? '-8px 0 24px rgba(0, 0, 0, 0.12)' : '';
      const under = underRef.current;
      if (under) {
        under.style.transition = transition;
        // Leichte Parallaxe der Seite darunter, wie beim iOS-Navigationsstapel.
        under.style.transform = x ? `translate3d(${Math.round((x / width - 1) * width * 0.3)}px, 0, 0)` : '';
      }
    };

    const reset = () => {
      style(0);
      callbacks.current.onPeek(false);
    };

    // Pointerdown in der Capture-Phase: Embla im Rezept-Karussell hört auf Pointer-Events und soll den Rand nicht greifen.
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && event.clientX <= EDGE_PX) event.stopPropagation();
    };

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      tracking = event.touches.length === 1 && !!touch && touch.clientX <= EDGE_PX;
      dragging = false;
      if (!touch) return;
      startX = lastX = touch.clientX;
      startY = touch.clientY;
      lastT = performance.now();
      velocity = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!dragging) {
        // Erst entscheiden, wenn die Richtung klar ist: senkrecht bleibt Scrollen.
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx) || dx <= 0) { tracking = false; return; }
        dragging = true;
        callbacks.current.onPeek(true);
      }
      event.preventDefault();
      offset = Math.max(0, dx);
      const now = performance.now();
      velocity = (touch.clientX - lastX) / Math.max(1, now - lastT);
      lastX = touch.clientX;
      lastT = now;
      style(offset);
    };

    const onEnd = () => {
      if (!dragging) { tracking = false; return; }
      dragging = false;
      tracking = false;
      const width = page.offsetWidth;
      const reduced = prefersReducedMotion();
      if (offset > width / 3 || velocity > 0.5) {
        style(width, reduced ? 'none' : 'transform 220ms cubic-bezier(0.32, 0, 0.67, 0)');
        window.setTimeout(() => {
          callbacks.current.onBack();
          // Die Route wechselt; falls die Seite doch bleibt (z. B. Navigation verhindert), sauber zurücksetzen.
          window.setTimeout(reset, 50);
        }, reduced ? 0 : 210);
      } else {
        style(0, reduced ? 'none' : `transform 320ms ${SHEET_EASE}`);
        window.setTimeout(reset, reduced ? 0 : 320);
      }
    };

    page.addEventListener('pointerdown', onPointerDown, true);
    page.addEventListener('touchstart', onStart, { passive: true });
    page.addEventListener('touchmove', onMove, { passive: false });
    page.addEventListener('touchend', onEnd);
    page.addEventListener('touchcancel', onEnd);
    return () => {
      page.removeEventListener('pointerdown', onPointerDown, true);
      page.removeEventListener('touchstart', onStart);
      page.removeEventListener('touchmove', onMove);
      page.removeEventListener('touchend', onEnd);
      page.removeEventListener('touchcancel', onEnd);
      style(0);
    };
  // pageKey: Die Seite wird je Route neu gemountet, die Listener müssen ans neue Element.
  }, [pageRef, underRef, enabled, pageKey]);
}
