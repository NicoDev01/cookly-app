import React from 'react';

/**
 * WelcomeStep - Erste Seite des Onboarding-Flows
 * 
 * Professionelle, mobile-optimierte Komponente ohne negative Margins.
 * Nutzt Safe Area Insets für Notch/Home Indicator und garantiert
 * Touch-Targets ≥44px gemäß Apple HIG.
 */
interface WelcomeStepProps {
  onNext: () => void;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext }) => {
  return (
    <div 
      className="flex flex-col items-center min-h-full px-4 pt-safe"
      style={{ 
        paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' 
      }}
    >
      {/* Logo Section - Above the fold on mobile */}
      <div className="flex-shrink-0 mb-3">
        <img
          src="/logo.png"
          alt="Cookly Logo"
          className="w-40 h-40 object-contain drop-shadow-md"
        />
      </div>

      {/* Mascot Illustration */}
      <div className="flex-shrink-0 w-full max-w-[240px] mb-4">
        <img
          src="/cookly-mascot.webp"
          alt="Cookly Illustration"
          className="w-full h-auto object-contain rounded-2xl"
        />
      </div>

      {/* Text Content */}
      <div className="flex-shrink-0 text-center mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
          Willkommen
        </h1>
        <h2 className="text-lg tracking-tight text-muted-foreground max-w-[280px] mx-auto">
          Cookly ist dein digitales Rezeptebuch
        </h2>
      </div>

      {/* CTA Button - Fixed at bottom with safe area */}
      <div 
        className="w-full max-w-[320px] pb-safe"
        style={{ 
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' 
        }}
      >
        <button
          onClick={onNext}
          className="
            w-full 
            min-h-[56px] 
            text-lg 
            font-semibold 
            bg-primary 
            hover:bg-primary/90 
            active:bg-primary/80 
            text-primary-foreground 
            shadow-lg 
            shadow-primary/20 
            rounded-full 
            active:scale-[0.98] 
            transition-all 
            duration-150 
            select-none
            touch-manipulation
          "
        >
          Weiter
        </button>
      </div>
    </div>
  );
};

export default WelcomeStep;
