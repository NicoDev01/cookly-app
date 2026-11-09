import React, { useState, useRef, useEffect, memo, useCallback, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { Recipe } from '../../../types';
import { ModalLoader } from '../../../components/PageLoader';

// Labor-Kopie von components/RecipeHero.tsx: Favorit lokal statt Convex, Wochenplan ohne Funktion.
const ImageZoomModal = lazy(() => import('../../../components/ImageZoomModal'));

interface RecipeHeroProps {
  recipe: Recipe;
  onSidebarToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

interface IconButtonProps {
  icon: string;
  onClick?: (e: React.MouseEvent) => void | Promise<void>;
  className?: string;
  isFilled?: boolean;
  animateBounce?: boolean;
  title?: string;
  ariaLabel?: string;
  ariaPressed?: boolean;
  variant?: 'default' | 'ghost' | 'glass';
}

const IconButton = memo(({ icon, onClick, className = '', isFilled = false, animateBounce = false, title, ariaLabel, ariaPressed, variant = 'default' }: IconButtonProps) => {
  const baseStyles = 'flex items-center justify-center size-10 rounded-full transition-all duration-200 active:scale-95';
  const variants = {
    default: 'bg-white/90 shadow-sm border border-gray-200/50 text-gray-900',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
    glass: 'bg-white/85 backdrop-blur-xl border border-white/40 shadow-lg shadow-black/5 text-gray-800 hover:bg-white/95 hover:scale-105',
  };
  return (
    <button
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]} ${className}`}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed === true ? 'true' : ariaPressed === false ? 'false' : undefined}
    >
      <span
        className={`material-symbols-outlined !text-[28px] ${isFilled ? 'filled text-red-500' : ''}`}
        style={animateBounce ? { animation: 'heartBounce 0.4s ease-in-out' } : undefined}
      >
        {icon}
      </span>
      <style>{`
        @keyframes heartBounce {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.3); }
          50% { transform: scale(0.95); }
          75% { transform: scale(1.1); }
        }
      `}</style>
    </button>
  );
});
IconButton.displayName = 'IconButton';

const LabRecipeHero: React.FC<RecipeHeroProps> = ({ recipe, onSidebarToggle, onEdit, onDelete }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [heartBounce, setHeartBounce] = useState(false);
  const [isFavorite, setIsFavorite] = useState(recipe.isFavorite);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggleFavorite = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setHeartBounce(true);
    setTimeout(() => setHeartBounce(false), 1000);
    setIsFavorite((v) => !v);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const heroImageSrc = recipe.image || recipe.sourceImageUrl || '';

  return (
    <div className="flex flex-col w-full bg-white group/hero">
      {/* Ohne weißen Notch-Balken: Bild läuft bis ganz oben, Knöpfe bleiben unter der Notch. */}
      <div className="sticky top-0 z-40 h-0 w-full">
        <div
          className="absolute top-0 left-0 right-0 px-4 pointer-events-none"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
        >
          <div className="flex items-center justify-between pointer-events-auto">
            <IconButton icon="arrow_back" onClick={onSidebarToggle} ariaLabel="Zurück" title="Zurück" variant="glass" />
            <div className="flex items-center gap-1">
              <IconButton
                icon="favorite"
                onClick={handleToggleFavorite}
                isFilled={isFavorite}
                animateBounce={heartBounce}
                ariaLabel={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                ariaPressed={isFavorite}
                title={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                variant="glass"
              />
              <IconButton icon="bookmark_add" ariaLabel="Zum Wochenplan hinzufügen" title="Zum Wochenplan hinzufügen (im Labor ohne Funktion)" variant="glass" />
              <div className="relative z-20" ref={menuRef}>
                <IconButton icon="more_vert" onClick={() => setIsMenuOpen((p) => !p)} ariaLabel="Mehr Optionen" title="Mehr Optionen" variant="glass" />
                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden origin-top-right animate-in fade-in zoom-in-95 duration-200 z-50">
                    <div className="p-1.5">
                      <button
                        onClick={() => { setIsMenuOpen(false); onEdit(); }}
                        className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-3 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg opacity-70">edit</span>
                        Rezept bearbeiten
                      </button>
                      <div className="h-px bg-gray-100 my-1 mx-2" />
                      <button
                        onClick={() => { setIsMenuOpen(false); setIsDeleteConfirmOpen(true); }}
                        className="w-full text-left px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-3 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg opacity-70">delete</span>
                        Rezept löschen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative w-full bg-white overflow-hidden cursor-zoom-in active:scale-[0.99] transition-transform duration-300"
        style={{ maxHeight: '70vh' }}
        onClick={() => setIsZoomOpen(true)}
      >
        {heroImageSrc ? (
          <img src={heroImageSrc} alt={recipe.imageAlt || recipe.title || 'Rezeptbild'} loading="eager" className="block w-full h-auto" />
        ) : (
          <div className="w-full h-56 bg-gray-200" />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover/hero:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
          <span className="material-symbols-outlined text-white opacity-0 group-hover/hero:opacity-100 transition-opacity !text-4xl scale-75 group-hover/hero:scale-100 duration-300">zoom_in</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-white" />
      </div>

      {isZoomOpen && (
        <Suspense fallback={<ModalLoader label="Bild lädt..." />}>
          <ImageZoomModal isOpen={isZoomOpen} onClose={() => setIsZoomOpen(false)} src={heroImageSrc} alt={recipe.imageAlt || recipe.title || 'Rezeptbild'} />
        </Suspense>
      )}

      {isDeleteConfirmOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsDeleteConfirmOpen(false)} />
            <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center">
                <div className="size-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-3xl">delete_forever</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Rezept löschen?</h3>
                <p className="text-sm text-gray-500 mb-6 font-medium">Soll das Rezept "{recipe.title}" wirklich unwiderruflich gelöscht werden?</p>
                <div className="flex gap-3 w-full">
                  <button onClick={() => setIsDeleteConfirmOpen(false)} className="flex-1 py-3 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">Abbrechen</button>
                  <button
                    onClick={() => { setIsDeleteConfirmOpen(false); onDelete(); }}
                    className="flex-1 py-3 rounded-xl font-bold bg-red-600 text-white shadow-lg shadow-red-600/20 active:scale-95 transition-all"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default LabRecipeHero;
