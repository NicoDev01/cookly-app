/**
 * Cookly Card Component
 * 
 * Card-Komponente mit Neomorphism-Styling.
 * Unterstützt verschiedene Zustände: elevated, pressed, flat, interactive.
 * 
 * @example
 * ```tsx
 * <Card variant="elevated">
 *   <CardHeader>
 *     <CardTitle>Rezepttitel</CardTitle>
 *   </CardHeader>
 *   <CardContent>Zutaten...</CardContent>
 * </Card>
 * ```
 */

import React from 'react';
import { cn } from '../../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Card-Variante */
  variant?: 'elevated' | 'pressed' | 'flat' | 'interactive';
  /** Card-Größe */
  size?: 'sm' | 'md' | 'lg';
  /** Klick-Handler für interactive Variante */
  onPress?: () => void;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'elevated',
      size = 'md',
      onPress,
      children,
      className,
      onClick,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'cookly-card';
    
    const variantStyles = {
      elevated: 'cookly-card--elevated',
      pressed: 'cookly-card--pressed',
      flat: 'cookly-card--flat',
      interactive: 'cookly-card--elevated cookly-card--interactive',
    };
    
    const sizeStyles = {
      sm: 'cookly-card--sm',
      md: '',
      lg: 'cookly-card--lg',
    };
    
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (variant === 'interactive' && onPress) {
        onPress();
      }
      onClick?.(e);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (variant === 'interactive' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onPress?.();
      }
      onKeyDown?.(e);
    };
    
    return (
      <div
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        onClick={handleClick}
        onKeyDown={variant === 'interactive' ? handleKeyDown : onKeyDown}
        role={variant === 'interactive' ? 'button' : undefined}
        tabIndex={variant === 'interactive' ? 0 : undefined}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'CooklyCard';

// Card Sub-Components

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1.5 mb-4', className)}
      {...props}
    />
  )
);
CardHeader.displayName = 'CooklyCardHeader';

export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('cookly-text-title', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CooklyCardTitle';

export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

export const CardDescription = React.forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('cookly-text-caption', className)}
      {...props}
    />
  )
);
CardDescription.displayName = 'CooklyCardDescription';

export type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('', className)} {...props} />
  )
);
CardContent.displayName = 'CooklyCardContent';

export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center gap-2 mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50', className)}
      {...props}
    />
  )
);
CardFooter.displayName = 'CooklyCardFooter';

export default Card;
