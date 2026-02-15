import React, { useState } from 'react';
import HowItWorksModal from './HowItWorksModal';

interface EmptyStateProps {
  openAddModal: (options?: { initialTab?: 'ai' | 'manual' }) => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ openAddModal }) => {
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center px-6 pt-4 animate-in fade-in">
      {/* Image Container with overlapping headline */}
      <div className="relative flex flex-col items-center">
        {/* Headline - positioned over the image */}
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-center z-10 mt-8">
          Willkommen bei <br /> <span className="text-primary italic">Cookly</span>
        </h1>

        {/* Image */}
        <img
          src="/platzhalter.png"
          alt="Cookly"
          className="w-100 h-100 object-contain -mt-32"
        />
      </div>

      {/* Subtext */}
      <p className="text-body text-text-secondary-light dark:text-text-secondary-dark text-center max-w-sm -mt-16 mb-2">
        Dein Kochbuch ist noch leer.
      </p>

      {/* So funktionierts Button */}
      <button
        onClick={() => {
          console.log('How It Works clicked');
          setIsHowItWorksOpen(true);
        }}
        className="relative z-20 px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow-neo-light-convex hover:bg-primary-dark active:scale-95 transition-all touch-btn"
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
