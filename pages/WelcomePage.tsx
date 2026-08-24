import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { logger } from '../utils/logger';
import { Button } from '../components/ui/cookly';
import BottomSheet from '../components/BottomSheet';
import { startGoogleOAuth } from '../services/googleOAuth';

/**
 * WelcomePage - Landing-Page für unangemeldete User
 */
export const WelcomePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const isPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview');

  React.useEffect(() => {
    if (isAuthenticated && !isPreview) {
      navigate('/tabs/categories', { replace: true });
    }
  }, [isAuthenticated, isPreview, navigate]);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    void StatusBar.setBackgroundColor({ color: '#b2c9ba' });
    void StatusBar.setStyle({ style: Style.Dark });

    return () => void StatusBar.setBackgroundColor({ color: '#f0f2f5' });
  }, []);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await startGoogleOAuth(() => signIn('google'));
    } catch (error) {
      logger.warn('Auth', 'Google OAuth failed (welcome)', error);
      setIsGoogleLoading(false);
    }
  };

  const handleEmailSignUp = () => {
    setIsBottomSheetOpen(false);
    navigate('/sign-up');
  };

  return (
    <div className="cookly-page cookly-page--no-nav min-h-[100dvh] overflow-x-clip bg-background-light text-[#333333] animate-fade-in">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col bg-background-light">
      <header className="relative flex h-[43dvh] min-h-[290px] max-h-[430px] flex-col items-center justify-center overflow-hidden bg-[#b2c9ba] px-6 pb-14 pt-[max(1rem,var(--safe-area-inset-top))]">
          <svg aria-hidden="true" className="absolute h-0 w-0">
            <defs>
              <filter id="cookly-mascot-edge" colorInterpolationFilters="sRGB">
                <feComponentTransfer>
                  <feFuncA type="gamma" amplitude="1" exponent="2.5" />
                </feComponentTransfer>
              </filter>
            </defs>
          </svg>
          <img
            src="/cookly-mascot.webp"
            alt=""
            className="w-[clamp(170px,45vw,230px)] object-contain"
            style={{ filter: 'url(#cookly-mascot-edge)' }}
          />
          <img
            src="/logo.png"
            alt="Cookly"
            className="mt-2 w-40 object-contain"
          />

          <svg
            aria-hidden="true"
            viewBox="0 0 480 90"
            preserveAspectRatio="none"
            className="pointer-events-none absolute bottom-0 left-0 h-16 w-full"
          >
            <path
              fill="#f0f2f5"
              d="M0 52C100 8 185 60 285 48c75-8 140-30 195-48v90H0Z"
            />
          </svg>
        </header>

        <main className="flex flex-1 flex-col items-center px-6 pb-[calc(var(--safe-area-inset-bottom)+1.25rem)] pt-7 text-center">
          <div className="max-w-sm">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              Alle deine Lieblingsrezepte an einem{' '}
              <span className="text-primary italic">Ort</span>
            </h1>
            <p className="mt-3 text-lg leading-snug text-gray-600">
              Importiere deine Rezepte aus{' '}
              <span className="text-primary italic">Instagram</span>,{' '}
              <span className="text-primary italic">Facebook</span>,{' '}
              <span className="text-primary italic">TikTok</span> oder einer{' '}
              <span className="text-primary italic">Website</span>.
            </p>
          </div>

          <div className="mt-auto w-full max-w-sm pt-8">
            <Button
              variant="primary"
              size="lg"
              onClick={() => setIsBottomSheetOpen(true)}
              className="min-h-[56px] w-full rounded-full bg-[#b2c8ba] px-8 text-lg font-semibold text-white transition-opacity hover:opacity-90"
            >
              Los geht&apos;s!
            </Button>

            <button
              onClick={() => navigate('/sign-in')}
              className="mt-4 min-h-[48px] w-full text-base font-medium text-[#789383] hover:underline"
            >
              Ich habe bereits einen Account
            </button>
          </div>
        </main>
      </div>

      {/* Registration Bottom Sheet */}
      <BottomSheet
        isOpen={isBottomSheetOpen}
        onClose={() => setIsBottomSheetOpen(false)}
        title="Registrieren"
        maxHeight="50vh"
      >
        <div className="p-4 pb-6 space-y-3">
          {/* Google OAuth Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-4 py-3.5 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {/* Google Icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>{isGoogleLoading ? 'Wird geladen...' : 'Mit Google anmelden'}</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500">oder</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Email Sign Up Button */}
          <button
            onClick={handleEmailSignUp}
            className="w-full rounded-xl px-4 py-3.5 font-medium text-white bg-[#b2c8ba] hover:opacity-90 transition-opacity"
          >
            Mit E-Mail-Adresse registrieren
          </button>

          {/* Terms */}
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 pt-2">
            Mit der Registrierung stimmst du unseren{' '}
            <a href="/terms" className="text-[#b2c8ba] hover:underline">
              Nutzungsbedingungen
            </a>{' '}
            und der{' '}
            <a href="/privacy" className="text-[#b2c8ba] hover:underline">
              Datenschutzerklärung
            </a>{' '}
            zu.
          </p>
        </div>
      </BottomSheet>
    </div>
  );
};

export default WelcomePage;
