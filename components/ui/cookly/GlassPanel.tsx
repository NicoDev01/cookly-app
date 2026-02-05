/**
 * Cookly Glass Panel Component
 * 
 * Glassmorphism Container mit backdrop-blur für Overlays und Navigation.
 * Perfekt für modale Dialoge, Bottom Sheets und Navigation Bars.
 * 
 * @example
 * ```tsx
 * <GlassPanel>
 *   <h2>Titel</h2>
 *   <p>Inhalt...</p>
 * </GlassPanel>
 * 
 * <GlassPanel variant="xl" className="fixed bottom-0 left-0 right-0">
 *   <BottomSheetContent />
 * </GlassPanel>
 * ```
 */

import React from 'react';
import { cn } from '../../../lib/utils';

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Panel-Variante (Blur-Stärke und Radius) */
  variant?: 'default' | 'xl' | 'sm';
  /** Mit Border */
  bordered?: boolean;
  /** Mit Schatten */
  shadowed?: boolean;
  /** Padding */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Als Modal-Card stylen */
  modal?: boolean;
}

export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  (
    {
      variant = 'default',
      bordered = true,
      shadowed = false,
      padding = 'md',
      modal = false,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const baseStyles = cn(
      'cookly-glass',
      variant === 'xl' && 'cookly-glass--xl',
      !bordered && 'border-transparent',
      shadowed && 'shadow-lg',
      modal && 'cookly-modal',
      padding === 'none' && 'p-0',
      padding === 'sm' && 'p-3',
      padding === 'md' && 'p-4',
      padding === 'lg' && 'p-6',
      className
    );
    
    return (
      <div
        ref={ref}
        className={baseStyles}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassPanel.displayName = 'CooklyGlassPanel';

// GlassPanel Overlay für Modals

export interface GlassOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Klick auf Overlay schließt Modal */
  onClose?: () => void;
  /** Z-Index */
  zIndex?: number;
}

export const GlassOverlay = React.forwardRef<HTMLDivElement, GlassOverlayProps>(
  (
    {
      onClose,
      zIndex,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'cookly-modal-overlay',
          className
        )}
        style={{ zIndex }}
        onClick={onClose}
        {...props}
      />
    );
  }
);

GlassOverlay.displayName = 'CooklyGlassOverlay';

export default GlassPanel;
