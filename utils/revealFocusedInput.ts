/**
 * Scrollt das fokussierte Eingabefeld in den sichtbaren Bereich seines Scroll-Containers.
 *
 * Nötig auf iOS mit @capacitor/keyboard: Das Plugin schaltet das eigene Nachscrollen der WKWebView ab.
 * Nachdem die .kb-shell-Flächen über die Tastatur geschrumpft sind, kann das Feld unter Buttons oder
 * dem unteren Rand liegen (z. B. Onboarding-Namensfeld, Login, lange Formulare).
 *
 * Bewusst kein `scrollIntoView`: Das scrollt auch `overflow: hidden`-Vorfahren wie die feste App-Shell
 * und ließe die App wieder verrutschen. Gescrollt wird nur der nächste echte Scroll-Container.
 */
const MARGIN_PX = 16;

const canScroll = (el: Element) =>
  /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight;

export const revealFocusedInput = () => {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement) || !field.matches('input, textarea, select, [contenteditable="true"]')) return;

  let box = field.parentElement;
  while (box && box !== document.body && !canScroll(box)) box = box.parentElement;

  // Die WebView bleibt gleich groß (resize: none); sichtbar ist nur, was über der Tastatur liegt.
  const keyboard = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0;
  let scroller: Element;
  let top = 0;
  let bottom = window.innerHeight - keyboard;
  if (box && box !== document.body) {
    scroller = box;
    const rect = box.getBoundingClientRect();
    top = rect.top;
    bottom = Math.min(rect.bottom, bottom);
  } else {
    // Seiten ohne App-Shell (Login, Registrierung) scrollen das Dokument; die Shell selbst nie.
    const page = document.scrollingElement;
    if (!page || getComputedStyle(document.documentElement).overflowY === 'hidden') return;
    scroller = page;
  }

  const rect = field.getBoundingClientRect();
  const delta = rect.bottom + MARGIN_PX > bottom
    ? rect.bottom + MARGIN_PX - bottom
    : rect.top - MARGIN_PX < top
      ? rect.top - MARGIN_PX - top
      : 0;
  if (delta) scroller.scrollBy({ top: delta, behavior: 'smooth' });
};
