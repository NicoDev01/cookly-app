import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAnimatedClose, useDragToDismiss } from '../addRecipe/motion';

/**
 * Schlichtes Bottom-Sheet im Stil von MealPlanModal (sheet-in). Eigenbau, weil es nur Overlay + Panel ist.
 * Lässt sich nach unten wegwischen und blendet beim Schließen aus wie das Plus-Sheet.
 */
const BottomSheet: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  subtitle,
  onClose,
  children,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const [closing, close] = useAnimatedClose(onClose);
  useDragToDismiss(sheetRef, scrimRef, onClose, !closing);

  return createPortal(
    <div className="kb-pad fixed inset-0 z-[100] flex items-end justify-center font-display" role="dialog" aria-modal="true" aria-label={title}>
      {/* Abdunklung vollflächig, Sheet-Farbe hinter der Tastatur: keine hellen Ecken. */}
      <button ref={scrimRef} type="button" aria-label="Schließen" className={`absolute inset-0 bg-black/40 ${closing ? 'scrim-out' : 'scrim-in'}`} onClick={close} />
      {!closing && <div className="kb-under bg-background-light dark:bg-background-dark" />}
      <div
        ref={sheetRef}
        className={`relative flex max-h-[80%] w-full flex-col rounded-t-3xl bg-background-light shadow-2xl will-change-transform dark:bg-background-dark ${closing ? 'sheet-out' : 'sheet-in'}`}
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
};

export default BottomSheet;
