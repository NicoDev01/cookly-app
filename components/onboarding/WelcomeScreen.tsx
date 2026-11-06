import React, { useEffect, useRef, useState } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { api } from '../../convex/_generated/api';
import { logger } from '../../utils/logger';
import { capture } from '../../services/analytics';
import { ensureNotificationPermission } from '../../utils/notifications';
import { OnboardingFlow, QUESTION_STEPS, type StepId } from './OnboardingFlow';
import { clearAnswers, loadAnswers, loggedOutHome, type OnboardingAnswers } from './onboardingData';

/**
 * Onboarding nach dem Login: speichert die Antworten aus /welcome, fragt nach
 * Benachrichtigungen (nur nativ) und zeigt die Paywall. Fehlen Antworten
 * (z. B. Registrierung direkt über /sign-up), laufen die Fragen hier.
 */
export const WelcomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const updateOnboarding = useMutation(api.users.updateOnboarding);
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const createUser = useMutation(api.users.createOrSyncUser);
  const currentUser = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : 'skip');
  const [stored] = useState(loadAnswers);
  const [steps, setSteps] = useState<StepId[] | null>(null);
  const savedRef = useRef(false);
  const syncTriedRef = useRef(false);

  // Direkt nach /sign-up gibt es den App-User noch nicht (ProtectedLayout wurde übersprungen).
  useEffect(() => {
    if (currentUser !== null || syncTriedRef.current) return;
    syncTriedRef.current = true;
    createUser().catch((error) => logger.error('Auth', 'createOrSyncUser failed (onboarding)', error));
  }, [currentUser, createUser]);

  // Schritte einmal festlegen: Fragen nur, wenn weder lokal noch am Konto Antworten liegen
  // (sonst kämen sie nach einem App-Abbruch bei Push oder Paywall doppelt).
  useEffect(() => {
    if (steps || !currentUser) return;
    const answered = !!stored || currentUser.recipeSources !== undefined || currentUser.onboardingGoals !== undefined
      || currentUser.referralSource !== undefined;
    setSteps([
      ...(answered ? [] : QUESTION_STEPS),
      ...(Capacitor.isNativePlatform() ? ['push' as const] : []),
      'paywall',
    ]);
  }, [currentUser, stored, steps]);

  const persist = (answers: OnboardingAnswers) => {
    if (savedRef.current) return;
    savedRef.current = true;
    capture('onboarding_goal_selected', { onboardingGoal: answers.goals.join(','), source: answers.sources.join(',') });
    updateOnboarding({
      name: answers.name || undefined,
      onboardingGoal: answers.goals.length ? answers.goals.join(', ') : undefined,
      onboardingGoals: answers.goals,
      recipeSources: answers.sources,
      referralSource: answers.referral || undefined,
    })
      .then(clearAnswers)
      .catch((error) => {
        savedRef.current = false;
        logger.warn('Onboarding', 'Saving onboarding answers failed', error);
      });
  };

  useEffect(() => {
    if (isAuthenticated && stored) persist(stored);
    // persist nur einmal nach dem Login
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const activatePush = async () => {
    const granted = await ensureNotificationPermission('onboarding');
    if (granted) await updateOnboarding({ notificationsEnabled: true }).catch(() => undefined);
  };

  const finish = async (result: 'free' | 'purchased') => {
    try {
      await completeOnboarding();
      capture('onboarding_completed', { result });
      capture('first_action_prompted', { entryPoint: 'onboarding_complete' });
      navigate('/tabs/categories', { replace: true });
    } catch (error) {
      logger.error('Onboarding', 'Complete onboarding failed', error);
    }
  };

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to={loggedOutHome()} replace />;
  if (currentUser?.onboardingCompleted) return <Navigate to="/tabs/categories" replace />;
  if (!steps) return null;

  return (
    <OnboardingFlow
      steps={steps}
      initialAnswers={stored}
      onAnswersReady={persist}
      onPushActivate={activatePush}
      onFinish={finish}
    />
  );
};

export default WelcomeScreen;
