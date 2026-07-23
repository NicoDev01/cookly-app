import React from 'react';

type LoaderProps = {
  label?: string;
};

export const PageLoader: React.FC<LoaderProps> = ({ label = 'Lädt...' }) => (
  <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background-light dark:bg-background-dark px-6">
    <div className="flex flex-col items-center gap-4 text-text-secondary-light dark:text-text-secondary-dark">
      <div className="w-10 h-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  </div>
);

export const ModalLoader: React.FC<LoaderProps> = ({ label = 'Lädt...' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-6">
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/95 dark:bg-card-dark/95 px-8 py-7 text-text-secondary-light dark:text-text-secondary-dark shadow-2xl">
      <div className="w-9 h-9 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  </div>
);

export default PageLoader;
