import React, { useState, useRef, useEffect } from 'react';

interface EmptyStateProps {
  openAddModal: (options?: { initialTab?: 'ai' | 'manual' }) => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ openAddModal }) => {
  // Dropdown state for import instructions
  const [openDropdown, setOpenDropdown] = useState<'instagram' | 'website' | 'photo' | null>(null);
  const instagramRef = useRef<HTMLDivElement>(null);
  const websiteRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);

  // Scroll to add manually button after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      const element = document.getElementById('add-manually');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        instagramRef.current &&
        !instagramRef.current.contains(target) &&
        websiteRef.current &&
        !websiteRef.current.contains(target) &&
        photoRef.current &&
        !photoRef.current.contains(target)
      ) {
        setOpenDropdown(null);
      }
    };

    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdown]);

  return (
    <div className="flex flex-col items-center justify-center px-6 pt-12 animate-in fade-in">
      {/* Image Container with overlapping headline */}
      <div className="relative flex flex-col items-center">
        {/* Headline - positioned over the image */}
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-center z-10 mt-8">
          Willkommen bei <span className="text-primary italic">Cookly</span>
        </h1>

        {/* Image */}
        <img
          src="/platzhalter.png"
          alt="Cookly"
          className="w-100 h-100 object-contain -mt-24"
        />
      </div>

      {/* Subtext */}
      <p className="text-body text-text-secondary-light dark:text-text-secondary-dark text-center max-w-sm">
        Dein Kochbuch ist noch leer.
      </p>
      <p className="text-body text-text-secondary-light dark:text-text-secondary-dark text-center mb-8 max-w-sm">
        Importiere dein erstes Rezept aus Instagram oder einer Webseite.
      </p>

      {/* Import Suggestions */}
      <div id="import-options" className="w-full max-w-sm space-y-4">
        {/* Instagram Import */}
        <div ref={instagramRef} className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'instagram' ? null : 'instagram')}
            className="w-full flex items-center gap-4 p-4 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all touch-card group"
          >
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shadow-inner flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-white">photo_camera</span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-body font-semibold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">
                Aus Instagram importieren
              </p>
            </div>
            <span className={`material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark transition-transform ${openDropdown === 'instagram' ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>

          {/* Instagram Instructions Dropdown */}
          {openDropdown === 'instagram' && (
            <div className="mt-2 p-4 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex animate-in fade-in slide-in-from-top-2">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">share</span>
                  <p className="text-body-sm text-text-primary-light dark:text-text-primary-dark">Bei Instagram auf 'Teilen' klicken</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">apps</span>
                  <p className="text-body-sm text-text-primary-light dark:text-text-primary-dark">Cookly App auswählen</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">download</span>
                  <p className="text-body-sm text-text-primary-light dark:text-text-primary-dark">Rezept wird automatisch importiert</p>
                </div>
              </div>
              <button
                onClick={() => window.open('https://www.instagram.com/reel/DAT9Z3yIHCb/?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==', '_blank')}
                className="mt-4 w-full py-2.5 px-4 rounded-lg bg-primary text-white font-medium text-body-sm hover:bg-primary-dark transition-colors shadow-neo-light-convex"
              >
                Jetzt ausprobieren
              </button>
            </div>
          )}
        </div>

        {/* Website Import */}
        <div ref={websiteRef} className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'website' ? null : 'website')}
            className="w-full flex items-center gap-4 p-4 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all touch-card group"
          >
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-inner flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-white">public</span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-body font-semibold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">
                Aus dem Web importieren
              </p>
            </div>
            <span className={`material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark transition-transform ${openDropdown === 'website' ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>

          {/* Website Instructions Dropdown */}
          {openDropdown === 'website' && (
            <div className="mt-2 p-4 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex animate-in fade-in slide-in-from-top-2">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">web</span>
                  <p className="text-body-sm text-text-primary-light dark:text-text-primary-dark">Rezeptseite besuchen</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">share</span>
                  <p className="text-body-sm text-text-primary-light dark:text-text-primary-dark">Rezept teilen (Share Button)</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">download</span>
                  <p className="text-body-sm text-text-primary-light dark:text-text-primary-dark">Cookly App auswählen - Rezept wird automatisch importiert</p>
                </div>
              </div>
              <button
                onClick={() => window.open('https://www.eat-this.org/wprm_print/veganes-risotto-mit-geroestetem-spargel#', '_blank')}
                className="mt-4 w-full py-2.5 px-4 rounded-lg bg-primary text-white font-medium text-body-sm hover:bg-primary-dark transition-colors shadow-neo-light-convex"
              >
                Jetzt ausprobieren
              </button>
            </div>
          )}
        </div>

        {/* Photo Upload / AI Scan */}
        <div ref={photoRef} className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'photo' ? null : 'photo')}
            className="w-full flex items-center gap-4 p-4 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all touch-card group"
          >
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-inner flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-white">add_a_photo</span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-body font-semibold text-text-primary-light dark:text-text-primary-dark group-hover:text-primary transition-colors">
                Rezeptfoto hochladen
              </p>
              <p className="text-body-sm text-text-secondary-light dark:text-text-secondary-dark">
                Mit KI scannen
              </p>
            </div>
            <span className={`material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark transition-transform ${openDropdown === 'photo' ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>

          {/* Photo Upload Instructions Dropdown */}
          {openDropdown === 'photo' && (
            <div className="mt-2 p-4 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex animate-in fade-in slide-in-from-top-2">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">photo_camera</span>
                  <p className="text-body-sm text-text-primary-light dark:text-text-primary-dark">Foto vom Rezept machen</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">add_circle</span>
                  <p className="text-body-sm text-text-primary-light dark:text-text-primary-dark">Auf den runden + Button klicken</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">cloud_upload</span>
                  <p className="text-body-sm text-text-primary-light dark:text-text-primary-dark">Foto hochladen</p>
                </div>
              </div>
              <button
                onClick={() => openAddModal({ initialTab: 'ai' })}
                className="mt-4 w-full py-2.5 px-4 rounded-lg bg-primary text-white font-medium text-body-sm hover:bg-primary-dark transition-colors shadow-neo-light-convex"
              >
                Jetzt ausprobieren
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Or add manually hint */}
      <div id="add-manually" className="mt-8 text-center">
        <button
          onClick={() => openAddModal()}
          className="text-body-sm text-primary hover:underline touch-btn"
        >
          Oder Rezept manuell hinzufügen →
        </button>
      </div>
    </div>
  );
};

export default EmptyState;
