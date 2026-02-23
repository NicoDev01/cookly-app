import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignIn, useAuth } from '@clerk/clerk-react';
import { Button } from '../components/ui/cookly';
import BottomSheet from '../components/BottomSheet';

/**
 * WelcomePage - Minimalistische Landing-Page für unangemeldete User
 * 
 * Zeigt ein animiertes Logo-Video mit Call-to-Action Buttons.
 * Vollständig öffentlich - kein Auth-Check erforderlich.
 */
export const WelcomePage: React.FC = () => {
  const navigate = useNavigate();
  const { signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Redirect if already signed in
  React.useEffect(() => {
    if (isSignedIn) {
      navigate('/tabs/categories', { replace: true });
    }
  }, [isSignedIn, navigate]);

  const handleGoogleSignIn = async () => {
    if (!signIn) return;

    setIsGoogleLoading(true);

    try {
      // WICHTIG: Bei HashRouter muss die redirectUrl mit # beginnen
      // Clerk leitet dann zu http://localhost:3000/#/sso-callback weiter
      // redirectUrlComplete wird NICHT gesetzt, damit SSOCallbackPage die
      // Weiterleitung basierend auf dem User-Status übernimmt
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: window.location.origin + '/#/sso-callback',
        redirectUrlComplete: window.location.origin + '/#/sso-callback',
      });
    } catch (error) {
      console.error('Google OAuth Error:', error);
      setIsGoogleLoading(false);
    }
  };

  const handleEmailSignUp = () => {
    setIsBottomSheetOpen(false);
    navigate('/sign-up');
  };

  return (
    <div className="cookly-page cookly-page--no-nav flex flex-col items-center justify-center min-h-screen bg-white dark:bg-background-dark animate-fade-in">
      {/* Video Container */}
      <div className="mb-20">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-60 h-60 object-contain"
          src="/welcome-video.webm"
        />
      </div>

      {/* CTA Button */}
      <Button
        variant="primary"
        size="lg"
        onClick={() => setIsBottomSheetOpen(true)}
        className="rounded-full px-8 py-3 bg-[#b2c8ba] text-white font-medium hover:opacity-90 transition-opacity"
      >
        Jetzt starten
      </Button>

      {/* Sign In Link */}
      <button
        onClick={() => navigate('/sign-in')}
        className="mt-4 text-base text-[#b2c8ba] hover:underline cookly-text-caption"
      >
        Anmelden
      </button>

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
