import React, { Suspense, useEffect, useCallback, useRef, useState } from 'react';
import { SendIntent } from '@supernotes/capacitor-send-intent';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { LottieSplashScreen } from 'capacitor-lottie-splash-screen';
import { App as CapacitorApp } from '@capacitor/app';
import { useNavigate, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from "@clerk/clerk-react";
import { useConvexAuth, useQuery, useMutation } from 'convex/react';
import { api } from './convex/_generated/api';
import { initDeepLinkHandler, removeDeepLinkHandler } from './services/deepLinkHandler';
import { useBackButton } from './hooks/useBackButton';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ModalProvider, useModal } from './contexts/ModalContext';
import { QueryCacheProvider } from './contexts/QueryCacheContext';

const CategoriesPage = React.lazy(() => import('./pages/CategoriesPage'));
const CategoryRecipesPage = React.lazy(() => import('./pages/CategoryRecipesPage'));
const RecipePage = React.lazy(() => import('./pages/RecipePage'));
const FavoritesPage = React.lazy(() => import('./pages/FavoritesPage'));
const WeeklyPage = React.lazy(() => import('./pages/WeeklyPage'));
const ShoppingPage = React.lazy(() => import('./pages/ShoppingPage'));
const ShareTargetPage = React.lazy(() => import('./pages/ShareTargetPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const SubscribePage = React.lazy(() => import('./pages/SubscribePage'));
const SignInPage = React.lazy(() => import('./pages/SignInPage'));
const SignUpPage = React.lazy(() => import('./pages/SignUpPage'));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
const WelcomeScreen = React.lazy(() => import('./components/onboarding/WelcomeScreen'));
const TabsLayout = React.lazy(() => import('./components/TabsLayout'));



const RootRedirect: React.FC = () => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null; // Native Lottie splash is visible in background
  }

  if (isSignedIn) {
    return <Navigate to="/tabs/categories" replace />;
  }

  return <Navigate to="/sign-in" replace />;
};

const ProtectedLayout: React.FC = () => {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser);
  const syncUser = useMutation(api.users.syncUserIfNotExists);
  const [hasTriedSync, setHasTriedSync] = useState(false);

  useEffect(() => {
    // Nur redirect wenn BEIDE (Clerk UND Convex) bestätigen: nicht eingeloggt
    // Verhindert Race Condition: Clerk ist sofort isSignedIn nach setActive(),
    // aber Convex braucht noch ~200ms für den Token-Austausch
    if (!isLoading && !isAuthenticated && !isSignedIn) {
      navigate('/sign-in', { replace: true });
    }
  }, [isLoading, isAuthenticated, isSignedIn, navigate]);

  // Sync user if authenticated but not in Convex yet
  useEffect(() => {
    const checkAndSyncUser = async () => {
      // FIX: Auch bei currentUser === null (gefunden aber leer) syncen
      if (!isLoading && isAuthenticated && (currentUser === undefined || currentUser === null) && !hasTriedSync) {
        console.log('[ProtectedLayout] User authenticated but not found in Convex, waiting for webhook...');
        setHasTriedSync(true);

        // Kurze Wartezeit für Webhook (500ms reicht für HTTP)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Wenn immer noch kein User, manuell syncen
        if (currentUser === undefined || currentUser === null) {
          try {
            console.log('[ProtectedLayout] Webhook may have failed, syncing user manually...');
            await syncUser();
            console.log('[ProtectedLayout] ✅ User synced successfully');
          } catch (error) {
            console.error('[ProtectedLayout] ❌ Sync failed:', error);
          }
        } else {
          console.log('[ProtectedLayout] ✅ Webhook synced user successfully');
        }
      }
    };
    checkAndSyncUser();
  }, [isLoading, isAuthenticated, currentUser, hasTriedSync, syncUser]);

  // While auth syncs, native Lottie splash is visible in background
  if (isLoading || (isSignedIn && !isAuthenticated)) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  // FIX: currentUser === null abfangen (User noch nicht in DB)
  if (currentUser === undefined || currentUser === null) {
    return null;
  }

  // Redirect to onboarding if not completed
  if (!currentUser.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const intentCheckCountRef = useRef(0);
  const lastIntentSignatureRef = useRef<string | null>(null);

  // Native Back Button Handler (Android)
  const { isAnyModalOpen, closeAllModals } = useModal();
  useBackButton({ isAnyModalOpen, closeModals: closeAllModals });

  useEffect(() => {
    initDeepLinkHandler(navigate);


    // Helper to check for intents
    const checkIntent = async (source: 'cold-start' | 'resume') => {
        if (!Capacitor.isNativePlatform()) return;
        
        try {
            intentCheckCountRef.current += 1;
            const checkId = intentCheckCountRef.current;
            console.log(`[SendIntent] checkIntent #${checkId} (${source})`);

            const result = await SendIntent.checkSendIntentReceived();
            console.log(`[SendIntent] checkIntent #${checkId} result:`, result);
            if (result && (result.title || result.description || result.url)) {
                console.log('SendIntent received:', result);
                const { title, description, url } = result;

                const signature = `${title ?? ''}|${description ?? ''}|${url ?? ''}`;
                const isDuplicate = lastIntentSignatureRef.current === signature;
                console.log(`[SendIntent] checkIntent #${checkId} has intent (duplicate=${isDuplicate})`, { signature });
                lastIntentSignatureRef.current = signature;
                
                // Redirect to ShareTargetPage with query params
                const params = new URLSearchParams();
                if (title) params.append('title', title);
                if (description) params.append('text', description); 
                if (url) params.append('url', url);
                
                navigate(`/share-target?${params.toString()}`);
            }
        } catch (err) {
            console.error('Error checking send intent:', err);
        }
    };

    // Initial check (Cold Start)
    checkIntent('cold-start');

    // Listen for App Resume (Warm Start)
    const setupListener = async () => {
        if (!Capacitor.isNativePlatform()) return;
        
        await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
                console.log('App resumed, checking for intent...');
                checkIntent('resume');
            }
        });
    };
    setupListener();

    return () => {
      removeDeepLinkHandler();
    };
  }, [navigate]);

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route index element={<RootRedirect />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/onboarding" element={<WelcomeScreen />} />

        <Route element={<ProtectedLayout />}>
          {/*
            Shared Shell: Use TabsLayout as the persistent container for ALL protected routes.
            TabsLayout handles manual rendering for smooth transitions.
          */}
          <Route element={<TabsLayout />}>
            <Route path="category/:category" element={<CategoryRecipesPage />} />
            <Route path="recipe/:id" element={<RecipePage />} />
            <Route path="share-target" element={<ShareTargetPage />} />

            {/* Redirects to /tabs/* routes */}
            <Route path="favorites" element={<Navigate to="/tabs/favorites" replace />} />
            <Route path="weekly" element={<Navigate to="/tabs/weekly" replace />} />
            <Route path="shopping" element={<Navigate to="/tabs/shopping" replace />} />
            <Route path="profile" element={<Navigate to="/tabs/profile" replace />} />
            <Route path="subscribe" element={<Navigate to="/tabs/subscribe" replace />} />

            {/* Tab routes - handled manually in TabsLayout for smooth transitions */}
            <Route path="tabs/*" element={<Outlet />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
};



const App: React.FC = () => {
  const handleError = useCallback((error: Error, errorInfo: React.ErrorInfo) => {
    console.error('Application Error:', error, errorInfo);
  }, []);

  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser);

  // PREFETCH: Load categories during splash for instant display
  // CRITICAL: Only fetch when authenticated to avoid "Not authenticated" error
  // This eliminates the "spinner gap" after splash ends
  const shouldFetchCategories = isSignedIn && isAuthenticated;
  useQuery(api.categories.getCategoriesWithStats, shouldFetchCategories ? {} : "skip");

  // Track if splash has been hidden to prevent duplicate calls
  const splashHiddenRef = useRef(false);

  // Centralized App Readiness Logic
  // This determines when we are TRULY ready to show the app content to the user
  // preventing any flicker or "black screen" issues.
  const isAppReady = React.useMemo(() => {
    // 1. Clerk must be loaded to know if we are signed in or not
    if (!clerkLoaded) return false;

    // 2. If NOT signed in, we are ready to show the SignIn/Welcome pages
    if (!isSignedIn) return true;

    // 3. If Signed In, we must wait for Convex to accept the token
    if (convexAuthLoading) return false;
    
    // 4. If Convex claims we aren't authenticated (despite Clerk saying so), wait/sync
    if (!isAuthenticated) return false;

    // 5. Finally, we need the user data to be loaded (or confirmed null)
    // Undefined means "loading", Null means "not found/new user" (handled by ProtectedLayout)
    if (currentUser === undefined) return false;

    return true;
  }, [clerkLoaded, isSignedIn, convexAuthLoading, isAuthenticated, currentUser]);

  // Effect: Hide Native Splash Screen ONLY when App is fully ready
  // With smooth fade-out transition for buttery feel
  useEffect(() => {
    if (isAppReady && !splashHiddenRef.current) {
      splashHiddenRef.current = true;

      // Phase 1: Fade-out duration (300ms for buttery smooth transition)
      const fadeTimeout = setTimeout(() => {
        SplashScreen.hide();
        LottieSplashScreen.hide();
        console.log('[Splash] Smooth fade-out complete - app visible');
      }, 300);

      // Phase 2: SAFETY NET - force hide if something goes wrong (5s max)
      const safetyTimeout = setTimeout(() => {
        console.warn('[Splash] Safety timeout triggered - forcing splash hide');
        SplashScreen.hide();
        LottieSplashScreen.hide();
      }, 5000);

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
          <div className="antialiased text-gray-900 dark:text-gray-100 min-h-screen bg-background-light dark:bg-background-dark relative">

            {/* Main App Content - Native Lottie splash runs in background until isAppReady = true */}
            {/* No React overlay needed - Lottie provides smooth visual continuity */}
            <AppContent />

          </div>
        </ModalProvider>
      </QueryCacheProvider>
    </ErrorBoundary>
  );
};

export default App;
