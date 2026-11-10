/**
 * Animationen der Import-Seite: schimmernde Platzhalter, Einblenden der Inhalte, Fortschritts-Card, Fehler-Screen.
 * Easing: Eintritte Expo-Out, kleine Elemente mit leichtem Overshoot, Austritte Ease-In.
 * Nur transform/opacity/filter, damit es auch auf älteren iPhones flüssig bleibt.
 */
const OUT = 'cubic-bezier(.16,1,.3,1)';
const SPRING = 'cubic-bezier(.34,1.4,.64,1)';
const IN = 'cubic-bezier(.5,0,.75,0)';

export const IMPORT_CARD_EXIT_MS = 450;

export const IMPORT_CSS = `
  .imp-bone { position:relative; display:block; overflow:hidden; background:#e5e9e7; border-radius:8px; }
  .imp-bone.absolute { position:absolute; }
  .imp-bone::after { content:''; position:absolute; inset:0; transform:translateX(-100%);
    background:linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent); animation: impSweep 1.5s cubic-bezier(.4,0,.2,1) infinite; }

  .imp-open { animation: impOpen .6s ${OUT} both; }
  .imp-in { animation: impIn .65s ${OUT} both; }
  .imp-pill-in { animation: impPill .55s ${SPRING} both; }
  .imp-hero-img { animation: impImg 1.1s ${OUT} both; }
  .imp-veil { animation: impFadeOut .9s ease-out .15s both; }
  .imp-meta h1 { animation: impIn .7s ${OUT} both; }
  .imp-meta h1 + div > * { animation: impIn .6s ${OUT} .08s both; }
  .imp-meta h1 + div > *:nth-child(2) { animation-delay:.15s; }
  .imp-meta h1 + div > *:nth-child(3) { animation-delay:.22s; }
  .imp-steps li { animation: impIn .6s ${OUT} both; }

  .imp-card { animation: impCardIn .7s ${OUT} .2s both; }
  .imp-card--instant { animation:none; }
  .imp-instant .imp-open, .imp-instant .imp-hero-img { animation:none; }
  .imp-instant .imp-veil { display:none; }
  .imp-card--leave { animation: impCardOut ${IMPORT_CARD_EXIT_MS}ms ${IN} both; }
  .imp-swap-text { display:inline-block; transition: opacity .22s ease-in, transform .22s ease-in, filter .22s ease-in; }
  .imp-swap-text.is-out { opacity:0; transform:translateY(-5px); filter:blur(3px); }
  .imp-swap-text.is-in { opacity:1; transform:none; filter:blur(0); transition: opacity .38s ${OUT}, transform .38s ${OUT}, filter .38s ${OUT}; }
  .imp-hop { animation: impHop .6s ${SPRING} both; transform-origin:50% 100%; }
  .imp-bob { animation: impBob 2.4s ease-in-out infinite; transform-origin:50% 90%; }
  .imp-pop { animation: impPop .55s ${SPRING} both; }
  .imp-fill { transition: width .25s linear; }
  .imp-fill--done { animation: impGlow .9s ease-out both; }

  .imp-fail > * { animation: impIn .7s ${OUT} both; }
  .imp-fail > *:nth-child(2) { animation-delay:.08s; }
  .imp-fail > *:nth-child(3) { animation-delay:.16s; }
  .imp-fail > *:nth-child(4) { animation-delay:.24s; }
  .imp-fail-pot { animation: impPop .7s ${SPRING} both; }

  @keyframes impSweep { to { transform:translateX(100%) } }
  @keyframes impOpen { from { opacity:0; transform:scale(.985) } to { opacity:1; transform:none } }
  @keyframes impIn { from { opacity:0; transform:translateY(8px); filter:blur(6px) } to { opacity:1; transform:none; filter:blur(0) } }
  @keyframes impPill { from { opacity:0; transform:translateY(6px) scale(.82); filter:blur(3px) } to { opacity:1; transform:none; filter:blur(0) } }
  @keyframes impImg { from { opacity:0; transform:scale(1.06); filter:blur(18px) saturate(.6) } to { opacity:1; transform:scale(1); filter:blur(0) saturate(1) } }
  @keyframes impFadeOut { to { opacity:0 } }
  @keyframes impCardIn { from { opacity:0; transform:translateY(calc(100% + 24px)) scale(.96) } to { opacity:1; transform:none } }
  @keyframes impCardOut { from { opacity:1; transform:none } to { opacity:0; transform:translateY(calc(100% + 24px)) scale(.96) } }
  @keyframes impHop { 0% { transform:scale(.9) translateY(4px) } 100% { transform:none } }
  @keyframes impBob { 0%,100% { transform:translateY(0) rotate(-2.5deg) } 50% { transform:translateY(-3px) rotate(2.5deg) } }
  @keyframes impPop { from { opacity:0; transform:scale(.5) } to { opacity:1; transform:scale(1) } }
  @keyframes impGlow { 0% { box-shadow:0 0 0 0 hsl(var(--primary) / .5) } 100% { box-shadow:0 0 0 10px hsl(var(--primary) / 0) } }

  @media (prefers-reduced-motion: reduce) {
    .imp-bone::after, .imp-bob { animation:none; }
    .imp-swap-text, .imp-swap-text.is-in, .imp-fill { transition:none; }
    .imp-open, .imp-in, .imp-pill-in, .imp-hero-img, .imp-veil, .imp-meta h1, .imp-meta h1 + div > *, .imp-steps li,
    .imp-card, .imp-card--leave, .imp-hop, .imp-pop, .imp-fill--done, .imp-fail > *, .imp-fail-pot { animation-duration:.01s; animation-delay:0s; }
  }
`;
