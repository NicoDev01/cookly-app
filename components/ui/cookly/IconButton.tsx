/**
 * Cookly Icon Button Component
 * 
 * Runde Icon-Buttons in verschiedenen Varianten und Größen.
 * Ideal für Toolbar-Actions und Navigation.
 * 
 * @example
 * ```tsx
 * <IconButton icon="arrow_back" variant="filled" onClick={goBack} />
 * <IconButton icon="favorite" variant="glass" size="lg" />
 * ```
 */

import React from 'react';
import { cn } from '../../../lib/utils';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Material Symbol Icon-Name */
  icon: string;
  /** Button-Variante */
  variant?: 'default' | 'filled' | 'glass';
  /** Button-Größe */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Icon als Filled-Variante anzeigen */
  filled?: boolean;
  /** Aktiver Zustand (zeigt filled Icon) */
  active?: boolean;
  /** Animation beim Klick */
  bounce?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      variant = 'default',
      size = 'md',
      filled = false,
      active = false,
      bounce = false,
      className,
      ...props
    },
    ref
  ) => {
    const [isBouncing, setIsBouncing] = React.useState(false);
    
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (bounce) {
        setIsBouncing(true);
        setTimeout(() => setIsBouncing(false), 400);
      }
      props.onClick?.(e);
    };
    
    const baseStyles = 'cookly-icon-button';
    
    const variantStyles = {
      default: '',
      filled: 'cookly-icon-button--filled',
      glass: 'cookly-icon-button--glass',
    };
    
    const sizeStyles = {
      sm: 'cookly-icon-button--sm',
      md: '',
      lg: 'cookly-icon-button--lg',
      xl: 'cookly-icon-button--xl',
    };
    
    const isFilled = filled || active;
    
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          isBouncing && 'heart-bounce',
          className
        )}
        onClick={handleClick}
        {...props}
      >
        <span 
          className={cn(
            'material-symbols-outlined',
            size === 'sm' && '!text-lg',
            size === 'md' && '!text-xl',
            size === 'lg' && '!text-2xl',
            size === 'xl' && '!text-3xl',
            isFilled && 'filled'
          )}
        >
          {icon}
        </span>
      </button>
    );
  }
);

IconButton.displayName = 'CooklyIconButton';

export default IconButton;
