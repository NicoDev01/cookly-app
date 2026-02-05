/**
 * Cookly Button Component
 * 
 * Einheitliche Button-Komponente mit Neomorphism-Styling.
 * Unterstützt verschiedene Varianten, Größen und Dark Mode.
 * 
 * @example
 * ```tsx
 * <Button variant="primary" size="md">Klick mich</Button>
 * <Button variant="secondary" leftIcon="shopping_cart">Zum Warenkorb</Button>
 * <Button variant="fab" icon="add" />
 * ```
 */

import React from 'react';
import { cn } from '../../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button-Variante */
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'fab';
  /** Button-Größe */
  size?: 'sm' | 'md' | 'lg';
  /** Material Symbol Icon (links) */
  leftIcon?: string;
  /** Material Symbol Icon (rechts) */
  rightIcon?: string;
  /** Icon für FAB-Variante */
  icon?: string;
  /** Ladezustand */
  loading?: boolean;
  /** Volle Breite */
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      leftIcon,
      rightIcon,
      icon,
      loading,
      fullWidth,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const isFab = variant === 'fab';
    
    const baseStyles = 'cookly-button';
    
    const variantStyles = {
      primary: 'cookly-button--primary',
      secondary: 'cookly-button--secondary',
      ghost: 'cookly-button--ghost',
      destructive: 'cookly-button--destructive',
      fab: 'cookly-button--fab',
    };
    
    const sizeStyles = {
      sm: 'cookly-button--sm',
      md: '',
      lg: 'cookly-button--lg',
    };
    
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <span className="material-symbols-outlined animate-spin !text-[1.2em]">
            refresh
          </span>
        )}
        {!loading && leftIcon && (
          <span className="material-symbols-outlined !text-[1.2em]">
            {leftIcon}
          </span>
        )}
        {!isFab && children}
        {!isFab && !loading && rightIcon && (
          <span className="material-symbols-outlined !text-[1.2em]">
            {rightIcon}
          </span>
        )}
        {isFab && icon && (
          <span className="material-symbols-outlined !text-2xl">
            {icon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'CooklyButton';

export default Button;
