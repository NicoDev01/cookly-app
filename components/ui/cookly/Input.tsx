/**
 * Cookly Input Component
 * 
 * Text Input im Cookly-Stil mit Neomorphism-Shadows.
 * Unterstützt Icons, Labels und verschiedene Varianten.
 * 
 * @example
 * ```tsx
 * <Input label="Titel" placeholder="Rezepttitel eingeben" />
 * <Input icon="search" variant="ghost" />
 * <Input type="number" label="Portionen" min={1} max={12} />
 * ```
 */

import React from 'react';
import { cn } from '../../../lib/utils';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input-Variante */
  variant?: 'default' | 'ghost';
  /** Input-Größe */
  size?: 'sm' | 'md' | 'lg';
  /** Material Symbol Icon (links) */
  icon?: string;
  /** Label-Text */
  label?: string;
  /** Fehlermeldung */
  error?: string;
  /** Hilfstext */
  helper?: string;
  /** Volle Breite */
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'default',
      size = 'md',
      icon,
      label,
      error,
      helper,
      fullWidth = true,
      className,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    
    const baseStyles = cn(
      'cookly-input',
      variant === 'ghost' && 'cookly-input--ghost',
      size === 'sm' && 'cookly-input--sm',
      size === 'lg' && 'cookly-input--lg',
      icon && 'pl-10',
      error && 'border-red-500 focus:border-red-500',
      fullWidth && 'w-full',
      className
    );
    
    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label 
            htmlFor={inputId}
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
          </label>
        )}
        
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 dark:text-gray-500">
              {icon}
            </span>
          )}
          
          <input
            ref={ref}
            id={inputId}
            className={baseStyles}
            {...props}
          />
        </div>
        
        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}
        
        {helper && !error && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{helper}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'CooklyInput';

// Select Component

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Select-Variante */
  variant?: 'default' | 'ghost';
  /** Select-Größe */
  size?: 'sm' | 'md' | 'lg';
  /** Label-Text */
  label?: string;
  /** Fehlermeldung */
  error?: string;
  /** Optionen */
  options: { value: string; label: string; disabled?: boolean }[];
  /** Platzhalter */
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      variant = 'default',
      size = 'md',
      label,
      error,
      options,
      placeholder,
      className,
      id,
      ...props
    },
    ref
  ) => {
    const generatedSelectId = React.useId();
    const selectId = id || generatedSelectId;
    
    const baseStyles = cn(
      'cookly-input cookly-select',
      variant === 'ghost' && 'cookly-input--ghost',
      size === 'sm' && 'cookly-input--sm',
      size === 'lg' && 'cookly-input--lg',
      error && 'border-red-500 focus:border-red-500',
      'w-full',
      className
    );
    
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label 
            htmlFor={selectId}
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
          </label>
        )}
        
        <select
          ref={ref}
          id={selectId}
          className={baseStyles}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option 
              key={option.value} 
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        
        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'CooklySelect';

export default Input;
