import React from 'react';

interface Props {
  error?: Error | null;
  onRetry?: () => void;
  title?: string;
  message?: string;
}

// User-friendly error messages based on error type
const getErrorDetails = (error: Error | null | undefined) => {
  if (!error) {
    return {
      title: 'Etwas ist schiefgelaufen',
      message: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.',
      icon: 'error',
    };
  }

  const message = error.message.toLowerCase();

  // Network errors
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return {
      title: 'Verbindungsfehler',
      message: 'Keine Verbindung zum Server. Bitte überprüfe deine Internetverbindung.',
      icon: 'wifi_off',
    };
  }

  // Timeout errors
  if (message.includes('timeout')) {
    return {
      title: 'Zeitüberschreitung',
      message: 'Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.',
      icon: 'schedule',
    };
  }

  // Permission errors
  if (message.includes('permission') || message.includes('unauthorized')) {
    return {
      title: 'Keine Berechtigung',
      message: 'Du hast keine Berechtigung für diese Aktion. Bitte melde dich an.',
      icon: 'lock',
    };
  }

  // Not found errors
  if (message.includes('not found') || message.includes('404')) {
    return {
      title: 'Nicht gefunden',
      message: 'Das angeforderte Element wurde nicht gefunden.',
      icon: 'search_off',
    };
  }

  // Default error
  return {
    title: 'Etwas ist schiefgelaufen',
    message: error.message || 'Ein unerwarteter Fehler ist aufgetreten.',
    icon: 'error',
  };
};

export const ErrorState: React.FC<Props> = ({
  error,
  onRetry,
  title: customTitle,
  message: customMessage,
}) => {
  const errorDetails = getErrorDetails(error);
  const title = customTitle || errorDetails.title;
  const message = customMessage || errorDetails.message;
  const icons = {
    error: 'error',
    wifi_off: 'wifi_off',
    schedule: 'schedule',
    lock: 'lock',
    search_off: 'search_off',
  };

  const icon = errorDetails.icon as keyof typeof icons;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-red-500 dark:text-red-400">
              {icons[icon] || 'error'}
            </span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
          {title}
        </h1>

        {/* Message */}
        <p className="text-text-secondary-light dark:text-text-secondary-dark">
          {message}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onRetry && (
            <button
              onClick={onRetry}
              className="touch-btn px-6 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">refresh</span>
              Erneut versuchen
            </button>
          )}
          <button
            onClick={() => window.location.href = '/'}
            className="touch-btn px-6 py-3 bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark rounded-xl font-medium hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Zur Startseite
          </button>
        </div>

        {/* Error details for debugging (dev only) */}
        {process.env.NODE_ENV === 'development' && error && (
          <details className="text-left mt-6">
            <summary className="cursor-pointer text-sm text-text-secondary-light dark:text-text-secondary-dark hover:text-primary">
              Fehlerdetails (Entwickler-Modus)
            </summary>
            <pre className="mt-2 p-4 bg-red-50 dark:bg-red-900/10 rounded-lg text-xs overflow-auto max-h-40 text-red-600 dark:text-red-400">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
};

ErrorState.displayName = 'ErrorState';
