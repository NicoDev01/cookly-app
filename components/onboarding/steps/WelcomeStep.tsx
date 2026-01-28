import React from 'react';

interface WelcomeStepProps {
  onNext: () => void;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext }) => {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-6">
      <img
        src="/logo.png"
        alt="Cookly Logo"
        className="w-40 h-40 mb-8 object-contain"
      />
      <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">
        Willkommen
      </h1>
      <h2 className="text-xl tracking-tight mb-8 text-foreground text-center">
        Cookly ist dein persönlicher Rezepteplaner
      </h2>
      <button
        onClick={onNext}
        className="w-full h-14 text-lg font-bold bg-primary active:bg-primary/80 text-primary-foreground shadow-lg shadow-primary/20 rounded-full active:scale-[0.98] transition-transform duration-150 select-none"
      >
        Weiter
      </button>
    </div>
  );
};
