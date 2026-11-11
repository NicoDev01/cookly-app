import { useEffect, type RefObject } from 'react';

/**
 * iOS zieht Scrollbereiche am oberen Rand trotz overscroll-behavior wie eine Website herunter.
 * Ziehen nach unten bei scrollTop 0 abfangen. iOS lässt touchmove nur abbrechen, bevor das
 * Scrollen begonnen hat, deshalb ohne Schwelle; überwiegend seitliches Wischen (Karussell) bleibt frei.
 */
export const usePreventPullDown = (ref: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = lastY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const { clientX, clientY } = e.touches[0];
      const pullingDown = clientY > lastY;
      lastY = clientY;
      const vertical = Math.abs(clientY - startY) >= Math.abs(clientX - startX);
      if (!pullingDown || !vertical || el.scrollTop > 0 || !e.cancelable) return;
      // Innere Scrollbereiche (z. B. Liste mit eigenem Scroll), die selbst noch nach oben scrollen können, bleiben frei.
      for (let node = e.target as HTMLElement | null; node && node !== el; node = node.parentElement) {
        if (node.scrollTop > 0) return;
      }
      e.preventDefault();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
    };
  }, [ref]);
};
