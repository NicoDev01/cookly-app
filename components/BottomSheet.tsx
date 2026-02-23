import React, { useEffect, useRef, useState, useCallback } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  showHandle?: boolean;
  maxHeight?: string;
}

// CSS-in-JS for animation keyframes
const animationStyles = `
  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }
  
  @keyframes slideDown {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(100%);
    }
  }
  
  .bottom-sheet-open {
    animation: slideUp 0.3s ease-out forwards;
  }
  
  .bottom-sheet-close {
    animation: slideDown 0.3s ease-out forwards;
  }
`;

// Inject styles once
if (typeof document !== 'undefined' && !document.getElementById('bottom-sheet-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'bottom-sheet-styles';
  styleSheet.textContent = animationStyles;
  document.head.appendChild(styleSheet);
}

const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  title,
  showHandle = true,
  maxHeight = '90vh',
}) => {
  const [shouldRender, setShouldRender] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);

  // Handle open
  useEffect(() => {
    if (isOpen && !shouldRender) {
      setShouldRender(true);
      document.body.style.overflow = 'hidden';
    }
  }, [isOpen, shouldRender]);

  // Handle close with animation
  const handleClose = useCallback(() => {
    setIsClosing(true);
    document.body.style.overflow = '';
    
    setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
      onClose();
    }, 280); // Slightly less than animation duration
  }, [onClose]);

  // Handle external close (when isOpen becomes false)
  useEffect(() => {
    if (!isOpen && shouldRender && !isClosing) {
      handleClose();
    }
  }, [isOpen, shouldRender, isClosing, handleClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;
    if (diff > 0) {
      setDragOffset(diff);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragOffset > 100) {
      handleClose();
    }
    setDragOffset(0);
  }, [dragOffset, handleClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (shouldRender) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [shouldRender, handleClose]);

  if (!shouldRender) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center pointer-events-none"
      onClick={handleBackdropClick}
    >
      {/* Invisible backdrop for click-to-close - no visual overlay */}
      <div className="absolute inset-0 pointer-events-auto" />
      
      {/* Bottom Sheet with CSS animation */}
      <div
        ref={sheetRef}
        className={`relative w-full bg-background-light dark:bg-background-dark rounded-t-3xl shadow-2xl overflow-hidden will-change-transform pb-[max(1rem,var(--safe-area-inset-bottom))] pointer-events-auto ${
          isClosing ? 'bottom-sheet-close' : 'bottom-sheet-open'
        }`}
        style={{
          maxHeight,
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: dragOffset > 0 ? 'none' : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {showHandle && (
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        )}

        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-bold text-text-primary-light dark:text-text-primary-dark">
              {title}
            </h2>
            <button
              onClick={handleClose}
              className="touch-btn p-2 -mr-2 text-text-secondary-light dark:text-text-secondary-dark"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        )}

        <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: `calc(${maxHeight} - 60px)` }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default BottomSheet;
