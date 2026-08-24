import React, { Suspense, useEffect, useCallback, useRef, useState } from 'react';
import { SendIntent } from '@supernotes/capacitor-send-intent';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { LottieSplashScreen } from 'capacitor-lottie-splash-screen';
import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications, LocalNotificationActionPerformed } from '@capacitor/local-notifications';
import { useNavigate, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useConvexAuth, useQuery, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from './convex/_generated/api';
import { initDeepLinkHandler, removeDeepLinkHandler } from './services/deepLinkHandler';
import { useBackButton } from './hooks/useBackButton';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ModalProvider, useModal } from './contexts/ModalContext';
import { QueryCacheProvider } from './contexts/QueryCacheContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { createNotificationChannel } from './utils/notifications';
import { logger } from './utils/logger';
import { waitForFonts } from './utils/fontsReady';
import { PageLoader } from './components/PageLoader';
import { AnalyticsLifecycle } from './components/AnalyticsLifecycle';
import { PushLifecycle } from './components/PushLifecycle';
import { InAppCampaign } from './components/InAppCampaign';
import { AdSlot } from './components/AdSlot';

const CategoryRecipesPage = React.lazy(() => import('./pages/CategoryRecipesPage'));
const RecipePage = React.lazy(() => import('./pages/RecipePage'));
const ShareTargetPage = React.lazy(() => import('./pages/ShareTargetPage'));
const SignInPage = React.lazy(() => import('./pages/SignInPage'));
const SignUpPage = React.lazy(() => import('./pages/SignUpPage'));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
const WelcomePage = React.lazy(() => import('./pages/WelcomePage'));
const WelcomeScreen = React.lazy(() => import('./components/onboarding/WelcomeScreen'));
const TabsLayout = React.lazy(() => import('./components/TabsLayout'));

// Verarbeitet den OAuth-Code nach Google Login (Android Deep Link)
const AuthCallbackPage: React.FC = () => {
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuthActions();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const params = new URLSearchParams(location.search);
    const code = params.get('code');

    if (!code) {
      navigate('/welcome', { replace: true });
      return;
    }

    // Convex Auth: code gegen Session tauschen
    signIn('google', { code })
      .then(() => navigate('/tabs/categories', { replace: true }))
      .catch((err) => {
        logger.error('Auth', 'OAuth code exchange failed', err);
        navigate('/sign-in', { replace: true });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wenn bereits eingeloggt (race condition), direkt weiterleiten
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/tabs/categories', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return null;
};

const RootRedirect: React.FC = () => {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/tabs/categories" replace />;
  return <Navigate to="/welcome" replace />;
};

const ProtectedLayout: React.FC = () => {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser);
  const createUser = useMutation(api.users.createOrSyncUser);
  const [hasTriedSync, setHasTriedSync] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/sign-in', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && currentUser === null && !hasTriedSync) {
      setHasTriedSync(true);
      createUser().catch((err) => logger.error('Auth', 'createOrSyncUser failed', err));
    }
  }, [isLoading, isAuthenticated, currentUser, hasTriedSync, createUser]);

  if (isLoading || !isAuthenticated || currentUser === undefined || currentUser === null) {
    return null;
  }

  if (!currentUser.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const intentCheckCountRef = useRef(0);

  // Native Back Button Handler (Android)
  const { isAnyModalOpen, closeAllModals } = useModal();
  useBackButton({ isAnyModalOpen, closeModals: closeAllModals });

  // Ref für navigate — wird in Listener-Callbacks gelesen
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Listener EINMALIG registrieren (mount-only)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Deep Link Handler registrieren
    initDeepLinkHandler((path: string) => navigateRef.current(path));

    // Notification Channel für Android 8+ erstellen
    createNotificationChannel();

    // Listener-Handles für Cleanup sammeln
    const cleanupFns: Array<() => void> = [];

    // Notification Action Listener
    LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (notification: LocalNotificationActionPerformed) => {
        logger.debug('Notifications', 'Notification action performed', notification);
        const extra = notification.notification.extra;
        if (extra?.recipeId && extra?.type === 'recipe-import') {
          logger.debug('Notifications', 'Navigating to recipe', { recipeId: extra.recipeId });
          navigateRef.current(`/recipe/${extra.recipeId}`);
        }
      }
    ).then((handle) => {
      cleanupFns.push(() => handle.remove());
    });

    // SendIntent Check Helper
    const checkIntent = async (source: 'cold-start' | 'resume') => {
      try {
        intentCheckCountRef.current += 1;
        const checkId = intentCheckCountRef.current;
        logger.debug('SendIntent', `checkIntent #${checkId} (${source})`);

        const result = await SendIntent.checkSendIntentReceived();
        logger.debug('SendIntent', `checkIntent #${checkId} result`, result);
        if (result && (result.title || result.description || result.url)) {
          logger.debug('SendIntent', 'received', result);
          const { title, description, url } = result;

          const params = new URLSearchParams();
          if (title) params.append('title', title);
          if (description) params.append('text', description);
          if (url) params.append('url', url);

          navigateRef.current(`/share-target?${params.toString()}`);
        }
      } catch (err) {
        // "No processing needed" ist kein echter Fehler — ignorieren
        if (err instanceof Error && err.message.includes('No processing needed')) {
          return;
        }
        logger.error('SendIntent', 'Error checking send intent', err);
      }
    };

    // Initial check (Cold Start)
    checkIntent('cold-start');

    // Listen for App Resume (Warm Start)
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        logger.debug('App', 'App resumed, checking for intent');
        checkIntent('resume');
      }
    }).then((handle) => {
      cleanupFns.push(() => handle.remove());
    });

    // Cleanup NUR bei Unmount
    return () => {
      removeDeepLinkHandler();
      cleanupFns.forEach((fn) => fn());
    };
  }, []);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route index element={<RootRedirect />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/onboarding" element={<WelcomeScreen />} />
        <Route path="/auth-callback" element={<AuthCallbackPage />} />

        <Route element={<ProtectedLayout />}>
          <Route element={<TabsLayout />}>
            <Route path="category/:category" element={<CategoryRecipesPage />} />
            <Route path="recipe/:id" element={<RecipePage />} />
            <Route path="share-target" element={<ShareTargetPage />} />

            <Route path="favorites" element={<Navigate to="/tabs/favorites" replace />} />
            <Route path="weekly" element={<Navigate to="/tabs/weekly" replace />} />
            <Route path="shopping" element={<Navigate to="/tabs/shopping" replace />} />
            <Route path="profile" element={<Navigate to="/tabs/profile" replace />} />
            <Route path="subscribe" element={<Navigate to="/tabs/subscribe" replace />} />

            <Route path="tabs/*" element={<Outlet />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
};



const App: React.FC = () => {
  const handleError = useCallback((error: Error, errorInfo: React.ErrorInfo) => {
    logger.error('App', 'Application error boundary', { error, errorInfo });
  }, []);

  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser);

  const shouldFetchCategories = isAuthenticated && !!currentUser;
  useQuery(api.categories.getCategoriesWithStats, shouldFetchCategories ? {} : "skip");
  useQuery(api.categories.list, shouldFetchCategories ? {} : "skip");

  const splashHiddenRef = useRef(false);

  const isAppReady = React.useMemo(() => {
    if (convexAuthLoading) return false;
    if (!isAuthenticated) return true;
    if (currentUser === undefined) return false;
    return true;
  }, [convexAuthLoading, isAuthenticated, currentUser]);

  useEffect(() => {
    if (isAppReady && !splashHiddenRef.current) {
      splashHiddenRef.current = true;

      const hideSplash = async () => {
        // Erst ausblenden, wenn die Fonts anliegen - sonst ist der erste
        // sichtbare Frame der mit Fallback-Schrift und Icons als Ligatur-Text.
        await waitForFonts();
        try {
          await SplashScreen.hide();
        } catch (e) {
          logger.warn('Splash', 'SplashScreen.hide() failed', e);
        }
        try {
          await LottieSplashScreen.hide();
        } catch (e) {
          logger.warn('Splash', 'LottieSplashScreen.hide() failed', e);
        }
        logger.debug('Splash', 'Splash hidden - app visible');
      };

      const fadeTimeout = setTimeout(hideSplash, 300);

      const safetyTimeout = setTimeout(async () => {
        logger.warn('Splash', 'Safety timeout triggered - forcing splash hide');
        try { await SplashScreen.hide(); } catch { /* ignore */ }
        try { await LottieSplashScreen.hide(); } catch { /* ignore */ }
      }, 15000);

      return () => {
        clearTimeout(fadeTimeout);
        clearTimeout(safetyTimeout);
      };
    }
  }, [isAppReady]);

  return (
    <ErrorBoundary onError={handleError}>
      <QueryCacheProvider>
        <ModalProvider>
          <NotificationProvider>
            <AnalyticsLifecycle />
            <PushLifecycle />
            <div className="antialiased text-gray-900 dark:text-gray-100 min-h-screen bg-background-light dark:bg-background-dark relative">
              <InAppCampaign />
              <AdSlot placement="home_feed" />
              <AppContent />
            </div>
          </NotificationProvider>
        </ModalProvider>
      </QueryCacheProvider>
    </ErrorBoundary>
  );
};

export default App;
