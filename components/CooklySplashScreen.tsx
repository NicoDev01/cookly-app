import React from 'react';

const CooklySplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white dark:bg-[#112021] overflow-hidden">
      {/* Ambient Background Gradient */}
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--primary)_0%,_transparent_70%)] animate-pulse-slow pointer-events-none" />
      
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo with Entrance Animation */}
        <div className="relative mb-8 animate-in-zoom">
          <img 
            src="/logo.png" 
            alt="Cookly" 
            className="w-32 h-32 object-contain drop-shadow-xl"
          />
        </div>
        
        {/* Premium Progress Bar */}
        <div className="w-48 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden shadow-inner">
          <div className="h-full bg-primary animate-progress-indeterminate rounded-full" />
        </div>
        
        {/* Tagline */}
        <p className="mt-6 text-primary font-sans font-medium tracking-[0.2em] uppercase text-xs opacity-0 animate-fade-in-up" style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}>
          Alle deine Rezepte, an einem Ort.
        </p>
      </div>
    </div>
  );
};

export default CooklySplashScreen;
