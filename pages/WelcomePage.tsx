import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useConvexAuth } from 'convex/react';
import { capture } from '../services/analytics';
import { OnboardingFlow, QUESTION_STEPS, type StepId } from '../components/onboarding/OnboardingFlow';
import { hasAccountOnDevice, loadAnswers, saveAnswers } from '../components/onboarding/onboardingData';

const GUEST_STEPS: StepId[] = ['start', ...QUESTION_STEPS, 'account'];

/**
 * WelcomePage – Onboarding vor dem Login: Fragen und Wert zuerst, Konto am Ende.
 * Die Antworten liegen bis zum Login lokal; /onboarding speichert sie danach in Convex.
 */
export const WelcomePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useConvexAuth();
  const [stored] = useState(loadAnswers);
  const [returning] = useState(hasAccountOnDevice);
  const isPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview');

  React.useEffect(() => {
    if (isAuthenticated && !isPreview) navigate('/tabs/categories', { replace: true });
  }, [isAuthenticated, isPreview, navigate]);

  React.useEffect(() => {
    if (!returning) capture('onboarding_started', { placement: 'welcome' });
  }, [returning]);

  // Das Onboarding gibt es nur beim ersten Start; wer hier schon angemeldet war, kommt zum Login.
  if (returning && !isAuthenticated && !isPreview) return <Navigate to="/sign-in" replace />;

  return (
    <OnboardingFlow
      steps={GUEST_STEPS}
      initialStep={stored ? 'account' : 'start'}
      initialAnswers={stored}
      onAnswersReady={saveAnswers}
    />
  );
};

export default WelcomePage;
