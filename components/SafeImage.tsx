import React, { useState, useEffect, useRef } from 'react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackText?: string;
  onRetry?: () => void;
  onSuccess?: () => void;
  autoRetry?: boolean; // Automatisch neu versuchen bei Fehler
}

const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  className,
  fallbackText,
  onRetry,
  onSuccess,
  autoRetry = true
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);
  const imgRef = useRef<HTMLImageElement>(null);

  // Wenn sich src ändert, aktualisiere currentSrc und setze Fehler zurück
  useEffect(() => {
    setCurrentSrc(src);
    setHasError(false);
    setIsLoading(true);
    setRetryCount(0);
  }, [src]);

  // Check if image is already loaded (from cache)
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      if (imgRef.current.naturalWidth > 0) {
        setIsLoading(false);
        if (onSuccess) onSuccess();
      }
    }
  }, [currentSrc]);

  const handleError = () => {
    if (autoRetry && onRetry && retryCount < 10) {
      // Automatisch neu versuchen (bis zu 10 Mal)
      setRetryCount(prev => prev + 1);
      setIsLoading(true);
      onRetry();
    } else {
      // Nach 10 Versuchen oder wenn autoRetry deaktiviert ist, Fehler anzeigen
      setHasError(true);
      setIsLoading(false);
    }
  };

  const handleManualRetry = () => {
    setHasError(false);
    setIsLoading(true);
    setRetryCount(0);
    if (onRetry) {
      onRetry();
    }
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {hasError ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600">
          <span className="material-symbols-outlined text-4xl mb-2">restaurant</span>
          {fallbackText && (
            <span className="text-sm font-medium">{fallbackText}</span>
          )}
          {onRetry && (
            <button
              onClick={handleManualRetry}
              className="mt-2 px-3 py-1 text-xs bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Neu laden
            </button>
          )}
        </div>
      ) : (
        <>
          {isLoading && (
            <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse" />
          )}
          <img
            ref={imgRef}
            src={currentSrc}
            alt={alt}
            className={`w-full h-full object-cover ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
            onLoad={() => {
              setIsLoading(false);
              if (onSuccess) onSuccess();
            }}
            onError={handleError}
          />
        </>
      )}
    </div>
  );
};

export default SafeImage;
