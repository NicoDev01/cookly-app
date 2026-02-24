import React, { useState } from 'react';
import HowItWorksModal from './HowItWorksModal';

interface EmptyStateProps {
  openAddModal: (options?: { initialTab?: 'ai' | 'manual' }) => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ openAddModal }) => {
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-8 animate-in fade-in">
      {/* Headline - oben, groß, zentriert */}
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-center mb-6">
        Willkommen bei <br />
        <span className="text-primary italic">Cookly</span>
      </h1>

      {/* Mascot-Bild - darunter, prominent für Willkommens-Screen */}
      <img
        src="/cookly-mascot.webp"
        alt="Cookly Maskottchen"
        className="w-64 h-64 sm:w-80 sm:h-80 object-contain mb-6"
      />

      {/* Subtext - darunter */}
      <p className="text-body text-text-secondary-light dark:text-text-secondary-dark text-center max-w-sm mb-6">
        Dein Kochbuch ist noch leer.
      </p>

      {/* Button - darunter, mobile-optimiert */}
      <button
        onClick={() => setIsHowItWorksOpen(true)}
        className="min-h-[44px] px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow-neo-light-convex hover:bg-primary-dark active:scale-95 transition-all touch-btn touch-manipulation"
      >
        So funktionierts
      </button>

      {/* How it works Modal (Portal-based, overlays everything including AppNav) */}
      <HowItWorksModal
        isOpen={isHowItWorksOpen}
        onClose={() => setIsHowItWorksOpen(false)}
        openAddModal={openAddModal}
      />
    </div>
  );
};

export default EmptyState;
