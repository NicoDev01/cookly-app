import React, { useState, useEffect, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useNavigate } from 'react-router-dom';
import { logger } from '../../utils/logger';
import { capture } from '../../services/analytics';
import { WelcomeStep } from './steps/WelcomeStep';
import { PersonalizationStep } from './steps/PersonalizationStep';
import { OnboardingProgress } from './OnboardingProgress';

export const WelcomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const updateOnboarding = useMutation(api.users.updateOnboarding);
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const contentRef = useRef<HTMLDivElement>(null);

  const totalSteps = 2;

  useEffect(() => {
    capture('onboarding_started');
  }, []);

  // Scroll to top when step changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    capture('onboarding_step_viewed', { step: currentStep });
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handlePersonalizationSubmit = (data: {
    name: string;
    onboardingGoal: string;
  }) => {
    handleCompleteOnboarding(data);
  };

  const handleCompleteOnboarding = async (data?: {
    name: string;
    onboardingGoal: string;
  }) => {
    try {
      // Update onboarding data if provided
      if (data) {
        await updateOnboarding({
          name: data.name || undefined,
          onboardingGoal: data.onboardingGoal,
        });
        capture('onboarding_goal_selected', { onboardingGoal: data.onboardingGoal });
      }

      // Complete onboarding
      await completeOnboarding();
      capture('onboarding_completed', { onboardingGoal: data?.onboardingGoal });
      capture('first_action_prompted', { entryPoint: 'onboarding_complete' });

      // Navigate to main app
      navigate('/tabs/categories');
    } catch (error) {
      logger.error('Onboarding', 'Complete onboarding failed', error);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep onNext={handleNext} />;
      case 1:
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

      {currentStep > 0 && (
        <div className="flex justify-center gap-4 mt-4 px-4 pb-4">
          <button
            onClick={handleBack}
            className="px-6 py-3 text-muted-foreground active:text-foreground active:scale-[0.98] transition-transform duration-150 select-none"
          >
            Zurück
          </button>
        </div>
      )}
    </div>
  );
};

export default WelcomeScreen;
