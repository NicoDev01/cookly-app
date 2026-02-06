import React from 'react';

interface WelcomeStepProps {
  onNext: () => void;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext }) => {
  return (
    <div className="flex flex-col items-center justify-start px-2 pb-8">
      <img
        src="/logo.png"
        alt="Cookly Logo"
        className="w-32 h-32 -mt-10 object-contain relative z-10 drop-shadow-md"
      />
      <img
        src="/platzhalter.png"
        alt="Cookly Illustration"
        className="w-full max-w-[320px] h-auto -mt-48 mb-8 object-contain rounded-3xl relative z-0"
      />
      <h1 className="text-3xl font-bold tracking-tight -mt-24 mb-2 text-foreground">
        Willkommen
      </h1>
      <h2 className="text-xl tracking-tight mb-6 text-foreground text-center">
        Cookly ist dein digitales Rezeptebuch</h2>
      <button
        onClick={onNext}
        className="w-full h-14 text-lg font-bold bg-primary active:bg-primary/80 text-primary-foreground shadow-lg shadow-primary/20 rounded-full active:scale-[0.98] transition-transform duration-150 select-none"
      >
        Weiter
      </button>
    </div>
  );
};
