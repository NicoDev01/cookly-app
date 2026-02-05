/**
 * Cookly Badge Component
 * 
 * Badge-Komponente für Zutaten, Tags und Labels.
 * Unterstützt 10 rotierende Ingredient-Farben und Shopping-Cart-Indikatoren.
 * 
 * @example
 * ```tsx
 * <Badge ingredient colorIndex={0} amount="200g">Tomaten</Badge>
 * <Badge variant="primary">Premium</Badge>
 * <Badge ingredient colorIndex={2} isInCart>Chicken</Badge>
 * ```
 */

import React from 'react';
import { cn } from '../../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Badge-Variante */
  variant?: 'default' | 'primary' | 'outline' | 'ingredient';
  /** Für Ingredient-Badges: Farb-Index (0-9) */
  colorIndex?: number;
  /** Für Ingredient-Badges: Menge anzeigen */
  amount?: string;
  /** Shopping-Cart Indikator anzeigen */
  isInCart?: boolean;
  /** Klickbar machen */
  interactive?: boolean;
  /** Größe */
  size?: 'sm' | 'md';
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  (
    {
      variant = 'default',
      colorIndex = 0,
      amount,
      isInCart = false,
      interactive = false,
      size = 'md',
      children,
      className,
      onClick,
      ...props
    },
    ref
  ) => {
    const normalizedIndex = Math.abs(colorIndex) % 10;
    
    const baseStyles = cn(
      'cookly-badge',
      size === 'sm' && 'text-xs px-2 py-0.5',
      interactive && 'cursor-pointer active:scale-95'
    );
    
    const variantStyles = {
      default: 'cookly-badge--default',
      primary: 'cookly-badge--primary',
      outline: 'cookly-badge--outline',
      ingredient: cn(
        'cookly-badge--ingredient',
        `cookly-badge--ingredient-${normalizedIndex + 1}`,
        'relative'
      ),
    };
    
    return (
      <div
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          className
        )}
        onClick={onClick}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        {...props}
      >
        {amount && <span className="opacity-80">{amount} </span>}
        {children}
        
        {/* Shopping Cart Indicator */}
        {variant === 'ingredient' && (
          <div
            className={cn(
              'cookly-badge__indicator',
              !isInCart && 'cookly-badge__indicator--hidden'
            )}
          >
            <span className="material-symbols-outlined !text-[10px] leading-none">
              shopping_cart
            </span>
          </div>
        )}
      </div>
    );
  }
);

Badge.displayName = 'CooklyBadge';

export default Badge;
