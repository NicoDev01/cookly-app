/**
 * Cookly Header Component
 * 
 * Wiederverwendbare Header-Komponente mit verschiedenen Varianten.
 * Unterstützt Zurück-Button, Logo, Titel und Action-Buttons.
 * 
 * @example
 * ```tsx
 * <Header variant="with-back" onBack={goBack} title="Rezept" />
 * <Header variant="transparent" title="Cookly" />
 * <Header variant="default" title="Einstellungen" rightActions={<Button />} />
 * ```
 */

import React from 'react';
import { cn } from '../../../lib/utils';
import { IconButton } from './IconButton';

export interface HeaderProps {
  /** Header-Variante */
  variant?: 'default' | 'transparent' | 'with-back';
  /** Seitentitel */
  title?: string;
  /** Logo statt Titel anzeigen */
  showLogo?: boolean;
  /** Zurück-Handler */
  onBack?: () => void;
  /** Rechte Action-Elemente */
  rightActions?: React.ReactNode;
  /** Zusätzliche Klasse */
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  variant = 'default',
  title,
  showLogo = false,
  onBack,
  rightActions,
  className,
}) => {
  const baseStyles = cn(
    'cookly-header',
    variant === 'transparent' && 'cookly-header--transparent',
    className
  );
  
  const contentStyles = cn(
    'cookly-header__content',
    variant === 'with-back' && 'cookly-header--with-back'
  );
  
  return (
    <header className={baseStyles}>
      <div className={contentStyles}>
        {/* Left Section */}
        <div className="flex items-center gap-2">
          {(variant === 'with-back' || onBack) && (
            <IconButton
              icon="arrow_back"
              variant="default"
              size="lg"
              onClick={onBack}
              aria-label="Zurück"
            />
          )}
          
          {showLogo ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                Cookly
              </span>
            </div>
          ) : title ? (
            <h1 className="cookly-header__title">
              {title}
            </h1>
          ) : null}
        </div>
        
        {/* Right Section */}
        {rightActions && (
          <div className="flex items-center gap-1">
            {rightActions}
          </div>
        )}
      </div>
    </header>
  );
};

Header.displayName = 'CooklyHeader';

export default Header;
