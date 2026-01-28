import React from 'react';

type LoadingTextVariant = 'analyzing' | 'saving' | 'loading' | 'uploading' | 'deleting' | 'processing';

interface LoadingTextProps {
  variant?: LoadingTextVariant;
  className?: string;
}

/**
 * LoadingText - Konsistente deutsche Lade-Texte für die gesamte App
 *
 * Varianten:
 * - analyzing: "KI analysiert..."
 * - saving: "Speichere..."
 * - loading: "Lade..."
 * - uploading: "Lade hoch..."
 * - deleting: "Lösche..."
 * - processing: "Verarbeite..."
 */
export const LoadingText: React.FC<LoadingTextProps> = ({
  variant = 'loading',
  className = ''
}) => {
  const texts: Record<LoadingTextVariant, string> = {
    analyzing: 'KI analysiert...',
    saving: 'Speichere...',
    loading: 'Lade...',
    uploading: 'Lade hoch...',
    deleting: 'Lösche...',
    processing: 'Verarbeite...'
  };

  return (
    <span className={className}>
      {texts[variant]}
    </span>
  );
};

/**
 * LoadingSpinner - Kombinierte Komponente mit Spinner + Text
 */
export const LoadingSpinner: React.FC<{
  variant?: LoadingTextVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({
  variant = 'loading',
  size = 'md',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-4',
    lg: 'w-12 h-12 border-4'
  };

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className={`${sizeClasses[size]} border-primary border-t-transparent rounded-full animate-spin`} />
      <LoadingText variant={variant} className="text-sm text-gray-600 dark:text-gray-400" />
    </div>
  );
};

export default LoadingText;
