import { useEffect, useRef } from 'react';
import type React from 'react';

const LONG_PRESS_MS = 500;
/** Mehr Bewegung = Scrollen, kein Halten. */
const MOVE_TOLERANCE_PX = 10;

/**
 * Halten öffnet ein Menü, kurzes Tippen bleibt normales Tippen.
 * `consumeLongPress()` im onClick aufrufen: true heißt, der Klick gehört zum Halten und wird ignoriert.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (s && (Math.abs(e.clientX - s.x) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - s.y) > MOVE_TOLERANCE_PX)) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  const consumeLongPress = () => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  };
  return { handlers, consumeLongPress };
}
