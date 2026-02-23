import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaFacebook, FaInstagram, FaGlobe } from 'react-icons/fa';

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
  openAddModal: (options?: { initialTab?: 'ai' | 'manual' }) => void;
}

const HowItWorksModal: React.FC<HowItWorksModalProps> = ({ isOpen, onClose, openAddModal }) => {
  const [openDropdown, setOpenDropdown] = useState<'instagram' | 'facebook' | 'website' | 'photo' | 'manual' | null>(null);
  const instagramRef = useRef<HTMLDivElement>(null);
  const facebookRef = useRef<HTMLDivElement>(null);
  const websiteRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const manualRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        instagramRef.current && !instagramRef.current.contains(target) &&
        facebookRef.current && !facebookRef.current.contains(target) &&
        websiteRef.current && !websiteRef.current.contains(target) &&
        photoRef.current && !photoRef.current.contains(target) &&
        manualRef.current && !manualRef.current.contains(target)
      ) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Prevent background scrolling
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleManualAdd = () => {
    onClose();
    // Use a small timeout to ensure transition smoothness if needed
    setTimeout(() => openAddModal({ initialTab: 'manual' }), 100);
  };

  const handlePhotoScan = () => {
    onClose();
    setTimeout(() => openAddModal({ initialTab: 'ai' }), 100);
  };

  // Handler for external links - closes modal before opening link
  const handleExternalLink = (url: string) => {
    onClose();
    window.open(url, '_blank');
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full h-[85vh] bg-background-light dark:bg-background-dark rounded-t-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Drag Handle Area */}
        <div className="flex justify-center pt-3 pb-2 cursor-pointer" onClick={onClose} onKeyDown={(e) => e.key === 'Enter' && onClose()} role="button" tabIndex={0} aria-label="Schließen">
          <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-xl font-bold text-text-primary-light dark:text-text-primary-dark font-display">
            So importierst du Rezepte
          </h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
          <div className="space-y-4">
            {/* Instagram */}
            <div ref={instagramRef} className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'instagram' ? null : 'instagram')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:scale-[0.98] transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shadow-lg truncate flex-shrink-0">
                  <FaInstagram className="text-2xl text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-base font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">
                    Instagram
                  </p>
                </div>
                <span className={`material-symbols-outlined text-gray-400 transition-transform duration-300 ${openDropdown === 'instagram' ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              {openDropdown === 'instagram' && (
                <div className="mt-3 p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">1</div>
                      <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">In Instagram auf 'Teilen' klicken</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">2</div>
                      <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">'Cookly' in der App-Liste wählen</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">3</div>
                      <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">Fertig! Rezept lädt sofort</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleExternalLink('https://www.instagram.com/reel/DUIdyKlDOaX/?igsh=YzAyMDM1MGJkZA==')}
                    className="mt-6 w-full py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 active:scale-[0.97] transition-all"
                  >
                    Jetzt ausprobieren
                  </button>
                </div>
              )}
            </div>

            {/* Facebook */}
            <div ref={facebookRef} className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'facebook' ? null : 'facebook')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:scale-[0.98] transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg truncate flex-shrink-0">
                  <FaFacebook className="text-2xl text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-base font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">
                    Facebook
                  </p>
                </div>
                <span className={`material-symbols-outlined text-gray-400 transition-transform duration-300 ${openDropdown === 'facebook' ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              {openDropdown === 'facebook' && (
                <div className="mt-3 p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">1</div>
                      <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">Bei Facebook auf 'Teilen' klicken</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">2</div>
                      <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">Cookly App auswählen</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleExternalLink('https://www.facebook.com/share/r/1AiDe5uE4M/')}
                    className="mt-6 w-full py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 active:scale-[0.97] transition-all"
                  >
                    Jetzt ausprobieren
                  </button>
                </div>
              )}
            </div>

            {/* Website */}
            <div ref={websiteRef} className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'website' ? null : 'website')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:scale-[0.98] transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg truncate flex-shrink-0">
                  <FaGlobe className="text-2xl text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-base font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">
                    Webseite
                  </p>
                </div>
                <span className={`material-symbols-outlined text-gray-400 transition-transform duration-300 ${openDropdown === 'website' ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              {openDropdown === 'website' && (
                <div className="mt-3 p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">Teile den Link einer Kochwebseite direkt mit Cookly. Unsere KI erkennt Zutaten und Schritte automatisch.</p>
                    <button
                      onClick={() => handleExternalLink('https://biancazapatka.com/de/einfache-pilz-pasta-mit-spinat-vegan/')}
                      className="w-full py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 active:scale-[0.97] transition-all"
                    >
                      Jetzt ausprobieren
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Photo Scan */}
            <div ref={photoRef} className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'photo' ? null : 'photo')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:scale-[0.98] transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg truncate flex-shrink-0">
                  <span className="material-symbols-outlined text-2xl text-white">photo_camera</span>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-base font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">
                    Foto-Scan / KI
                  </p>
                </div>
                <span className={`material-symbols-outlined text-gray-400 transition-transform duration-300 ${openDropdown === 'photo' ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              {openDropdown === 'photo' && (
                <div className="mt-3 p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
                  <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-6">Fotografiere ein Rezept aus einem Buch oder vom Bildschirm. Wir digitalisieren es für dich.</p>
                  <button
                    onClick={handlePhotoScan}
                    className="w-full py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined">add_a_photo</span>
                    Foto machen
                  </button>
                </div>
              )}
            </div>

            {/* Manual Add Dropdown */}
            <div ref={manualRef} className="relative pb-8">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'manual' ? null : 'manual')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:scale-[0.98] transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-500 to-gray-700 flex items-center justify-center shadow-lg truncate flex-shrink-0">
                  <span className="material-symbols-outlined text-2xl text-white">edit_note</span>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-base font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">
                    Manuell hinzufügen
                  </p>
                </div>
                <span className={`material-symbols-outlined text-gray-400 transition-transform duration-300 ${openDropdown === 'manual' ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              {openDropdown === 'manual' && (
                <div className="mt-3 p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
                  <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-6">Für deine eigenen Kreationen oder Familienrezepte, die nirgendwo online stehen.</p>
                  <button
                    onClick={handleManualAdd}
                    className="w-full py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined">add_circle</span>
                    Rezept erstellen
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>,
    document.body
  );
};

export default HowItWorksModal;