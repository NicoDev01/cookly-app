import { useEffect, useState } from 'react';
import { preloadImage, sizedImageUrl } from '../utils/imageUrl';

/**
 * Bild-URL, die erst wechselt, wenn das neue Bild geladen ist. Nach einem Import ersetzt der Server
 * die Fremd-URL durch die Storage-Kopie; ohne Vorladen fiele das Bild kurz auf Höhe 0 und die Seite spränge.
 */
export const useLoadedImageSrc = (src: string) => {
  const [shown, setShown] = useState(src);
  useEffect(() => {
    if (!src || src === shown) return;
    let active = true;
    void preloadImage(sizedImageUrl(src, window.innerWidth, window.devicePixelRatio || 1)).then(() => {
      if (active) setShown(src);
    });
    return () => {
      active = false;
    };
  }, [src, shown]);
  return src ? shown || src : '';
};
