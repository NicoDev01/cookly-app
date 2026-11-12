import React from 'react';

/** Topf schwebt sanft; ohne Animation bei „Bewegung reduzieren“. */
const FLOAT_CSS = `
@keyframes cookly-pot-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@media (prefers-reduced-motion: no-preference) { .cookly-pot-float { animation: cookly-pot-float 3.2s ease-in-out infinite } }
`;

/**
 * Pflicht-Update als Karte von unten, Topf mit Glocke sitzt auf der Kante.
 * Liegt über allem (auch Tabs, Modals, Kochmodus) und hat bewusst keinen Schließen-Weg.
 * Nur Darstellung; wann sie erscheint und was der Button tut, steuert RequiredUpdateGate.
 */
export const RequiredUpdateCard: React.FC<{ platform: 'ios' | 'android'; busy?: boolean; onUpdate: () => void }> = ({
  platform,
  busy = false,
  onUpdate,
}) => (
  <div
    className="fixed inset-0 z-[20000] flex items-end justify-center bg-black/40 font-display backdrop-blur-[3px] animate-in fade-in"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="required-update-title"
    aria-describedby="required-update-body"
  >
    <style>{FLOAT_CSS}</style>
    <div
      className="relative w-full max-w-lg rounded-t-[36px] bg-white px-7 pt-28 text-center shadow-2xl animate-in slide-in-from-bottom duration-500 dark:bg-background-dark"
      style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom, 0px) + 2rem)' }}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-32 overflow-hidden rounded-t-[36px]">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/35 via-primary/10 to-transparent" />
        <div className="absolute -left-8 top-16 h-24 w-40 rounded-full bg-white/70 blur-xl dark:bg-white/5" />
        <div className="absolute -right-6 top-20 h-20 w-36 rounded-full bg-white/70 blur-xl dark:bg-white/5" />
      </div>
      <img
        src="/onboarding/pot-bell.webp"
        alt=""
        className="cookly-pot-float absolute inset-x-0 -top-20 mx-auto w-60 drop-shadow-[0_12px_18px_rgba(40,60,45,0.18)]"
      />
      <div className="relative">
        <h2 id="required-update-title" className="text-2xl font-black text-text-primary-light dark:text-text-primary-dark">
          Ding! Update benötigt
        </h2>
        <p id="required-update-body" className="mx-auto mt-2 max-w-[19rem] text-[15px] leading-relaxed text-text-secondary-light dark:text-text-secondary-dark">
          Wir haben Cookly verbessert. Damit deine Rezepte reibungslos laufen, brauchst du die neue Version.
        </p>
        <button
          type="button"
          onClick={onUpdate}
          disabled={busy}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-bold text-white shadow-[0_10px_24px_-10px_hsl(var(--primary))] transition active:scale-95 disabled:opacity-70"
        >
          <span className={`material-symbols-outlined text-xl ${busy ? 'animate-spin' : ''}`}>sync</span>
          {platform === 'ios' ? 'Im App Store aktualisieren' : 'Jetzt aktualisieren'}
        </button>
      </div>
    </div>
  </div>
);
