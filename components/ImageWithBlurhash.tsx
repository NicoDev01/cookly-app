import React, { useState, useEffect, useRef } from 'react';
import { Blurhash } from 'react-blurhash';
import { capture } from '../services/analytics';
import { logger } from '../utils/logger';

const MAX_LOADED_IMAGE_CACHE = 200;
const loadedImageUrls = new Set<string>();
const loadedImageOrder: string[] = [];

const rememberLoadedImage = (url: string) => {
  if (!url || loadedImageUrls.has(url)) return;
  loadedImageUrls.add(url);
  loadedImageOrder.push(url);

  if (loadedImageOrder.length > MAX_LOADED_IMAGE_CACHE) {
    const oldest = loadedImageOrder.shift();
    if (oldest) loadedImageUrls.delete(oldest);
  }
};

interface ImageWithBlurhashProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  blurhash?: string | null;
  alt: string;
  className?: string;
  fit?: 'cover' | 'contain';
  forceLoad?: boolean; // For modal images - load even if off-screen
}

const ImageWithBlurhash: React.FC<ImageWithBlurhashProps> = ({
  src,
  blurhash,
  alt,
  className,
  fit = 'cover',
  forceLoad = false,
  decoding = 'async',
  ...props
}) => {
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>(() => loadedImageUrls.has(src) ? src : undefined);
  const [failedSrc, setFailedSrc] = useState<string>();
  const [requestedSrc, setRequestedSrc] = useState<string>();
  const imgRef = useRef<HTMLImageElement>(null);
  const loadStartedAt = useRef(0);
  const shouldInstantRender = forceLoad;
  const isLoaded = loadedSrc === src || loadedImageUrls.has(src);
  const hasError = failedSrc === src;

  useEffect(() => {
    loadStartedAt.current = performance.now();
    if (forceLoad || !imgRef.current) return;
    const image = imgRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRequestedSrc(src);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' }
    );

    observer.observe(image);
    return () => observer.disconnect();
  }, [src, forceLoad]);

  if (!src) return null;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {blurhash && !hasError && !isLoaded && !shouldInstantRender && (
        <div
          className={`absolute inset-0 transition-opacity duration-150 ${isLoaded ? 'opacity-0' : 'opacity-100'}`}
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
        src={forceLoad || requestedSrc === src ? src : undefined}
        data-src={forceLoad ? undefined : src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading={forceLoad ? 'eager' : 'lazy'}
        decoding={decoding}
        className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} ${shouldInstantRender ? 'opacity-100 transition-none' : `transition-opacity duration-150 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}`}
        onLoad={() => {
          const cacheHit = loadedImageUrls.has(src);
          rememberLoadedImage(src);
          setFailedSrc(undefined);
          setLoadedSrc(src);
          capture('image_load_completed', {
            durationMs: Math.round(performance.now() - loadStartedAt.current),
            cacheHit,
          });
        }}
        onError={() => {
          logger.warn('Image', 'Image failed to load', { src });
          setFailedSrc(src);
          setLoadedSrc(src);
          capture('image_load_failed', {
            durationMs: Math.round(performance.now() - loadStartedAt.current),
          });
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
