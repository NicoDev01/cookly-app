import React, { useState, useEffect } from 'react';
import { Blurhash } from 'react-blurhash';

interface ImageWithBlurhashProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  blurhash?: string | null;
  alt: string;
  className?: string;
}

const ImageWithBlurhash: React.FC<ImageWithBlurhashProps> = ({ 
  src, 
  blurhash, 
  alt, 
  className,
  ...props 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.referrerPolicy = "no-referrer"; // WICHTIG: Damit Instagram/Meta Bilder laden
    img.onload = () => setIsLoaded(true);
    img.onerror = () => setIsLoaded(true); // Auch bei Fehler anzeigen (damit man wenigstens Alt-Text sieht)
    img.src = src;
  }, [src]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {blurhash && (
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
        src={src}
        alt={alt}
        referrerPolicy="no-referrer" // WICHTIG: Verhindert 403 Forbidden bei Instagram/CDN Links
        className={`w-full h-full object-cover transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'} ${className}`}
        onLoad={() => setIsLoaded(true)}
        onError={() => setIsLoaded(true)}
        {...props}
      />
    </div>
  );
};

export default ImageWithBlurhash;
