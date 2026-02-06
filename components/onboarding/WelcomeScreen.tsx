import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useNavigate } from 'react-router-dom';
import { WelcomeStep } from './steps/WelcomeStep';
import { FeaturesStep } from './steps/FeaturesStep';
import { PersonalizationStep } from './steps/PersonalizationStep';
import { OnboardingProgress } from './OnboardingProgress';

export const WelcomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [onboardingData, setOnboardingData] = useState({
    name: '',
    cookingFrequency: 'regular',
    preferredCuisines: [] as string[],
  });

  const updateOnboarding = useMutation(api.users.updateOnboarding);
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const contentRef = useRef<HTMLDivElement>(null);

  const totalSteps = 3;

  // Scroll to top when step changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleCompleteOnboarding();
  };

  const handlePersonalizationSubmit = (data: {
    name: string;
    cookingFrequency: string;
    preferredCuisines: string[];
  }) => {
    setOnboardingData(data);
    handleCompleteOnboarding(data);
  };

  const handleCompleteOnboarding = async (data?: {
    name: string;
    cookingFrequency: string;
    preferredCuisines: string[];
  }) => {
    try {
      // Update onboarding data if provided
      if (data) {
        await updateOnboarding({
          name: data.name || undefined,
          cookingFrequency: data.cookingFrequency,
          preferredCuisines: data.preferredCuisines,
          notificationsEnabled: false,
        });
      }

      // Complete onboarding
      await completeOnboarding();

      // Navigate to main app
      navigate('/tabs/categories');
    } catch (error) {
      console.error('Error completing onboarding:', error);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep onNext={handleNext} />;
      case 1:
        return <FeaturesStep onNext={handleNext} />;
      case 2:
        return (
          <PersonalizationStep
            onNext={handlePersonalizationSubmit}
          />
        );
      default:
        return <WelcomeStep onNext={handleNext} />;
    }
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white dark:bg-slate-950">
      <OnboardingProgress currentStep={currentStep} totalSteps={totalSteps} />
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        {renderStep()}
      </div>

      {currentStep > 0 && currentStep < 2 && (
        <div className="flex justify-center gap-4 mt-4 px-4 pb-4">
          <button
            onClick={handleBack}
            className="px-6 py-3 text-muted-foreground active:text-foreground active:scale-[0.98] transition-transform duration-150 select-none"
          >
            Zurück
          </button>
          <button
            onClick={handleSkip}
            className="px-6 py-3 text-muted-foreground/60 active:text-muted-foreground active:scale-[0.98] transition-transform duration-150 select-none"
          >
            Überspringen
          </button>
        </div>
      )}
    </div>
  );
};

export default WelcomeScreen;
