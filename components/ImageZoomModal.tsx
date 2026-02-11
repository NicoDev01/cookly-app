import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
}

const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ isOpen, onClose, src, alt }) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  // State for gesture handling
  const lastTouch = useRef({ x: 0, y: 0 });
  const startDist = useRef(0);
  const startScale = useRef(1);
  const lastOffset = useRef({ x: 0, y: 0 });
  const lastTapTime = useRef(0);

  // Close animation duration
  const ANIMATION_DURATION = 300;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isAnimating) return;
    
    // Double tap to zoom
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      if (scale > 1) {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      } else {
        setScale(2.5);
      }
      lastTapTime.current = 0;
      return;
    }
    lastTapTime.current = now;

    lastTouch.current = { x: e.clientX, y: e.clientY };
    lastOffset.current = offset;
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isAnimating) return;
    
    // Single touch pan
    if (e.buttons === 1 && scale > 1) {
      const dx = e.clientX - lastTouch.current.x;
      const dy = e.clientY - lastTouch.current.y;
      
      setOffset({
        x: lastOffset.current.x + dx,
        y: lastOffset.current.y + dy
      });
    }
  };

  // Pinch-to-zoom logic for mobile
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        startDist.current = d;
        startScale.current = scale;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist.current > 0) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const newScale = Math.max(1, Math.min(startScale.current * (d / startDist.current), 5));
        setScale(newScale);
        
        // Reset offset if scale is 1
        if (newScale === 1) {
          setOffset({ x: 0, y: 0 });
        }
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [scale]);

  const handleClose = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => {
      setIsAnimating(false);
      onClose();
    }, ANIMATION_DURATION);
  }, [onClose]);

  if (!isOpen && !isAnimating) return null;

  return createPortal(
    <div 
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-black transition-opacity duration-300 ${isOpen && !isAnimating ? 'bg-opacity-100 opacity-100' : 'bg-opacity-0 opacity-0'}`}
      ref={containerRef}
    >
      {/* Close Button */}
      <button 
        onClick={handleClose}
        className="absolute top-4 right-4 z-[210] size-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-transform"
        style={{ top: 'max(1rem, var(--safe-area-inset-top))' }}
      >
        <span className="material-symbols-outlined !text-[28px]">close</span>
      </button>

      {/* Image Container */}
      <div 
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        style={{ touchAction: 'none' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain transition-transform duration-200 ease-out will-change-transform"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
          draggable={false}
        />
      </div>
      
      {/* Background hint */}
      <div className="absolute bottom-10 left-0 right-0 text-center pointer-events-none">
        <p className="text-white/50 text-xs font-medium tracking-widest uppercase">
          {scale > 1 ? 'Ziehen zum Bewegen' : 'Pinch zum Zoomen • Doppeltippen'}
        </p>
      </div>
    </div>,
    document.body
  );
};

export default ImageZoomModal;
