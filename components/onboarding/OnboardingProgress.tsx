import React from 'react';

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
}

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
  currentStep,
  totalSteps,
}) => {
  return (
    <div className="flex items-center justify-center gap-2 pt-10 mb-8 px-4">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div
          key={index}
          className={`h-2 rounded-full transition-all ${
            index < currentStep
              ? 'w-8 bg-primary/80'
              : index === currentStep
              ? 'w-8 bg-primary/80'
              : 'w-2 bg-primary/10'
          }`}
        />
      ))}
    </div>
  );
};
