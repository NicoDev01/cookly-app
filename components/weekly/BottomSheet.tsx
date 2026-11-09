import React from 'react';
import { createPortal } from 'react-dom';

/** Schlichtes Bottom-Sheet im Stil von MealPlanModal (slide-up-enter). Eigenbau, weil es nur Overlay + Panel ist. */
const BottomSheet: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  subtitle,
  onClose,
  children,
}) =>
  createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center font-display" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Schließen" className="absolute inset-0 bg-black/40 animate-in fade-in" onClick={onClose} />
      <div
        className="relative flex max-h-[80vh] w-full flex-col rounded-t-3xl bg-background-light shadow-2xl slide-up-enter dark:bg-background-dark"
        style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-gray-300 dark:bg-white/20" />
        <div className="px-6 pb-3 pt-3">
          <h2 className="line-clamp-2 text-lg font-bold text-text-primary-light dark:text-text-primary-dark">{title}</h2>
          {subtitle && <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">{subtitle}</p>}
        </div>
        <div className="overflow-y-auto overscroll-contain px-6">{children}</div>
      </div>
    </div>,
    document.body,
  );

export default BottomSheet;
