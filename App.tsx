import React, { Suspense, useEffect, useCallback, useRef, useState } from 'react';
import { SendIntent } from '@supernotes/capacitor-send-intent';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapacitorApp } from '@capacitor/app';
import { useNavigate, useLocation, Routes, Route, Navigate, Outlet } from 'react-router-dom';
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
const WelcomeScreen = React.lazy(() => import('./components/onboarding/WelcomeScreen'));
const TabsLayout = React.lazy(() => import('./components/TabsLayout'));

const PageLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
    <div className="text-center">
      <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-text-secondary-light dark:text-text-secondary-dark">Lade...</p>
    </div>
  </div>
);

const RootRedirect: React.FC = () => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <PageLoader />;
  }

  if (isSignedIn) {
    return <Navigate to="/tabs/categories" replace />;
  }

  return <Navigate to="/sign-in" replace />;
};

const ProtectedLayout: React.FC = () => {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser);
  const syncUser = useMutation(api.users.syncUserIfNotExists);
  const [hasTriedSync, setHasTriedSync] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/sign-in', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Sync user if authenticated but not in Convex yet
  useEffect(() => {
    const checkAndSyncUser = async () => {
      if (!isLoading && isAuthenticated && currentUser === undefined && !hasTriedSync) {
        console.log('[ProtectedLayout] User authenticated but not found in Convex, waiting for webhook...');
        setHasTriedSync(true);

        // Kurze Wartezeit für Webhook (500ms reicht für HTTP)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Wenn immer noch kein User, manuell syncen
        if (currentUser === undefined) {
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

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <PageLoader />;
  }

  if (currentUser === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-text-secondary-light dark:text-text-secondary-dark">Benutzerprofil wird eingerichtet...</p>
        </div>
      </div>
    );
  }

  // Redirect to onboarding if not completed
  if (!currentUser.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Native Back Button Handler (Android)
  const { isAnyModalOpen, closeAllModals } = useModal();
  useBackButton({ isAnyModalOpen, closeModals: closeAllModals });

  useEffect(() => {
    initDeepLinkHandler(navigate);


    // Helper to check for intents
    const checkIntent = async () => {
        if (!Capacitor.isNativePlatform()) return;
        
        try {
            const result = await SendIntent.checkSendIntentReceived();
            if (result && (result.title || result.description || result.url)) {
                console.log('SendIntent received:', result);
                const { title, description, url } = result;
                
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
    checkIntent();

    // Listen for App Resume (Warm Start)
    const setupListener = async () => {
        if (!Capacitor.isNativePlatform()) return;
        
        await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
                console.log('App resumed, checking for intent...');
                checkIntent();
            }
        });
    };
    setupListener();

    return () => {
      removeDeepLinkHandler();
    };
  }, [navigate]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route index element={<RootRedirect />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
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
  const { isLoading: convexLoading } = useConvexAuth();

  useEffect(() => {
    if (!clerkLoaded) return;
    
    // Logic:
    // 1. If user is NOT signed in, we only need to wait for Clerk (isLoaded).
    // 2. If user IS signed in, we must also wait for Convex to exchange the token (convexLoading).
    
    if (!isSignedIn) {
      SplashScreen.hide();
    } else if (!convexLoading) {
       SplashScreen.hide();
    }
  }, [clerkLoaded, isSignedIn, convexLoading]);

  return (
    <ErrorBoundary onError={handleError}>
      <QueryCacheProvider>
        <ModalProvider>
          <div className="antialiased text-gray-900 dark:text-gray-100 min-h-screen bg-background-light dark:bg-background-dark">
            <AppContent />
          </div>
        </ModalProvider>
      </QueryCacheProvider>
    </ErrorBoundary>
  );
};

export default App;
