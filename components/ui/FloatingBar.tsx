import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Schwebt über der Tab-Leiste und über dem runden „+ Rezept“-Knopf (56 px + 8 px Abstand), damit beide frei bleiben.
 * Per Portal, weil page-enter ein transform setzt und fixed sonst am Seitenende klebt.
 */
const FloatingBar: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  createPortal(
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-150"
      style={{ bottom: 'calc(var(--nav-height) + var(--safe-area-inset-bottom, 0px) + 4.75rem)' }}
    >
      {children}
    </div>,
    document.body,
  );

export default FloatingBar;
