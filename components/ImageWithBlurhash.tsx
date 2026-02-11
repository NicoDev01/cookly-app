import React, { useState, useEffect, useRef } from 'react';
import { Blurhash } from 'react-blurhash';

interface ImageWithBlurhashProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  blurhash?: string | null;
  alt: string;
  className?: string;
  forceLoad?: boolean; // For modal images - load even if off-screen
}

const ImageWithBlurhash: React.FC<ImageWithBlurhashProps> = ({
  src,
  blurhash,
  alt,
  className,
  forceLoad = false,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Preload image with proper error handling
  useEffect(() => {
    if (!src) return;

    setIsLoaded(false);
    setHasError(false);

    const img = new Image();
    img.referrerPolicy = "no-referrer";

    img.onload = () => {
      setIsLoaded(true);
    };
    img.onerror = (e) => {
      console.warn('[ImageWithBlurhash] Image failed to load:', src);
      setHasError(true);
      setIsLoaded(true); // Still show loaded state to hide blurhash
    };

    img.src = src;
  }, [src]);

  // Intersection Observer for lazy loading (only when not in modal/forceLoad)
  useEffect(() => {
    if (forceLoad || !imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && imgRef.current) {
            // Image is in view, ensure src is set
            const currentSrc = imgRef.current.src;
            if (!currentSrc || currentSrc === window.location.href) {
              imgRef.current.src = src;
            }
            observer.unobserve(imgRef.current);
          }
        });
      },
      { rootMargin: '50px' }
    );

    observer.observe(imgRef.current);
    observerRef.current = observer;

    return () => {
      if (observerRef.current && imgRef.current) {
        observerRef.current.unobserve(imgRef.current);
      }
    };
  }, [src, forceLoad]);

  if (!src) return null;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {blurhash && !hasError && (
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${isLoaded ? 'opacity-0' : 'opacity-100'}`}
          style={{ zIndex: 1 }}
        >
          <Blurhash
            hash={blurhash}
            width="100%"
            height="100%"
            resolutionX={32}
            resolutionY={32}
            punch={1}
          />
        </div>
      )}
      <img
        ref={imgRef}
        src={forceLoad ? src : undefined}
        data-src={forceLoad ? undefined : src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading={forceLoad ? 'eager' : 'lazy'}
        className={`w-full h-full object-cover transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setHasError(true);
          setIsLoaded(true);
        }}
        {...props}
      />
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700">
          <span className="material-symbols-outlined text-gray-400">broken_image</span>
        </div>
      )}
    </div>
  );
};

export default ImageWithBlurhash;
