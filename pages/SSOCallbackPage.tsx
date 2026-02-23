import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, AuthenticateWithRedirectCallback } from '@clerk/clerk-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';

/**
 * SSOCallbackPage - Handler für OAuth Redirects (Google, etc.)
 * 
 * Diese Seite wird von Clerk nach erfolgreicher OAuth-Authentifizierung
 * aufgerufen und leitet basierend auf dem User-Status weiter:
 * 
 * Flow:
 * 1. AuthenticateWithRedirectCallback verarbeitet den OAuth-Callback
 * 2. Neuer User (kein Convex-Datensatz) → /onboarding
 * 3. Existierender User + onboardingCompleted → /tabs/categories
 * 4. Existierender User + !onboardingCompleted → /onboarding
 * 
 * WICHTIG: AuthenticateWithRedirectCallback ist ZWINGEND erforderlich,
 * um den OAuth-Flow abzuschließen. Ohne diese Komponente bleibt die
 * Seite bei "Anmeldung wird abgeschlossen..." hängen.
 */
export const SSOCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();
  const currentUser = useQuery(api.users.getCurrentUser);
  const syncUser = useMutation(api.users.syncUserIfNotExists);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect-Logik nach erfolgreicher OAuth-Authentifizierung
  useEffect(() => {
    // Warten bis Auth geladen ist
    if (!isLoaded) return;

    // Wenn nicht eingeloggt, nichts tun (AuthenticateWithRedirectCallback arbeitet)
    if (!isSignedIn) return;

    // Verhindern von mehrfachen Redirects
    if (isProcessing) return;

    // Warten bis User-Daten geladen sind
    if (currentUser === undefined) return;

    const handleRedirect = async () => {
      setIsProcessing(true);

      try {
        // User existiert noch nicht in Convex → Sync versuchen
        if (currentUser === null) {
          console.log('[SSOCallback] New user, syncing to Convex...');
          try {
            await syncUser();
            console.log('[SSOCallback] User synced successfully');
          } catch (syncError) {
            console.error('[SSOCallback] Sync failed:', syncError);
            // Trotzdem zum Onboarding weiterleiten
          }
          console.log('[SSOCallback] Redirecting to /onboarding');
          navigate('/onboarding', { replace: true });
          return;
        }

        // User existiert, prüfe Onboarding-Status
        if (currentUser.onboardingCompleted) {
          console.log('[SSOCallback] Existing user with completed onboarding, redirecting to /tabs/categories');
          navigate('/tabs/categories', { replace: true });
        } else {
          console.log('[SSOCallback] Existing user without onboarding, redirecting to /onboarding');
          navigate('/onboarding', { replace: true });
        }
      } catch (err) {
        console.error('[SSOCallback] Error during redirect:', err);
        setError('Anmeldung fehlgeschlagen. Bitte versuche es erneut.');
        setIsProcessing(false);
      }
    };

    handleRedirect();
  }, [isLoaded, isSignedIn, currentUser, navigate, syncUser, isProcessing]);

  // Fehleranzeige
  if (error) {
    return (
      <div className="cookly-page cookly-page--no-nav flex items-center justify-center min-h-screen bg-white dark:bg-background-dark">
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => navigate('/sign-in', { replace: true })}
            className="mt-2 px-4 py-2 bg-[#b2c8ba] text-white rounded-full text-sm font-medium"
          >
            Zurück zum Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cookly-page cookly-page--no-nav flex items-center justify-center min-h-screen bg-white dark:bg-background-dark">
      {/* 
        CRITICAL: AuthenticateWithRedirectCallback verarbeitet den OAuth-Callback.
        Ohne diese Komponente wird der OAuth-Flow nie abgeschlossen und die Seite
        bleibt bei "Anmeldung wird abgeschlossen..." hängen.
      */}
      {!isSignedIn && <AuthenticateWithRedirectCallback />}
      
      {/* Loading Indicator */}
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-[#b2c8ba] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
          Anmeldung wird abgeschlossen...
        </p>
      </div>
    </div>
  );
};

export default SSOCallbackPage;
