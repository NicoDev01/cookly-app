import React from 'react';
import { ArrowLeft, ChevronRight, X, type LucideIcon } from 'lucide-react';

/** Cookly-Farben aus dem Onboarding (components/onboarding/onboarding.css). */
export const C = { bg: '#edf3ee', ink: '#15241b', muted: '#56665c', cta: '#2f5d46', ctaOff: '#a9c2b3', line: '#d3e0d6', soft: '#dcebe1', orange: '#e8873a', brown: '#8a6d4b' };
export const IG = 'linear-gradient(45deg,#f58529,#dd2a7b 50%,#8134af 80%,#515bd4)';

export const Header: React.FC<{ title: string; sub?: string; onBack?: () => void; onClose?: () => void }> = ({ title, sub, onBack, onClose }) => (
  <div className="flex items-start gap-3 pb-4 pt-3">
    {onBack && (
      <button type="button" onClick={onBack} aria-label="Zurück" className="-ml-1 flex size-10 flex-none items-center justify-center rounded-full bg-white shadow-sm active:scale-95">
        <ArrowLeft size={20} />
      </button>
    )}
    <div className="min-w-0 flex-1 pt-1">
      <h2 className="text-[22px] font-extrabold leading-tight tracking-[-0.015em]">{title}</h2>
      {sub && <p className="mt-0.5 text-[14px] leading-snug" style={{ color: C.muted }}>{sub}</p>}
    </div>
    {onClose && (
      <button type="button" onClick={onClose} aria-label="Schließen" className="-mr-1 flex size-10 flex-none items-center justify-center rounded-full bg-white shadow-sm active:scale-95">
        <X size={20} />
      </button>
    )}
  </div>
);

export const Badge: React.FC<{ bg: string; children: React.ReactNode; size?: number; ring?: string }> = ({ bg, children, size = 34, ring }) => (
  <span className="flex flex-none items-center justify-center rounded-full text-white" style={{ background: bg, width: size, height: size, boxShadow: ring ? `0 0 0 2.5px ${ring}` : undefined }}>
    {children}
  </span>
);

export const Row: React.FC<{ icon: LucideIcon; tint: string; tintBg: string; title: string; sub?: string; disabled?: boolean; onClick: () => void }> = ({ icon: Icon, tint, tintBg, title, sub, disabled, onClick }) => (
  <button type="button" disabled={disabled} onClick={onClick} className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-transform active:scale-[0.98] disabled:opacity-50">
    <span className="flex size-11 flex-none items-center justify-center rounded-full" style={{ background: tintBg, color: tint }}>
      <Icon size={21} strokeWidth={2.2} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-bold">{title}</span>
      {sub && <span className="block text-[13px]" style={{ color: C.muted }}>{sub}</span>}
    </span>
    <ChevronRight size={18} style={{ color: C.muted }} />
  </button>
);
