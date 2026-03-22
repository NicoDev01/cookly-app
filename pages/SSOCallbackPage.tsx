import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClerk } from '@clerk/clerk-react';

/**
 * SSOCallbackPage - Handler für OAuth Redirects (Google, etc.)
 *
 * Diese Seite wird von Clerk nach erfolgreicher OAuth-Authentifizierung
 * aufgerufen. Sie verarbeitet den Token und leitet den User weiter.
 *
 * Flow:
 * 1. handleRedirectCallback() verarbeitet den OAuth-Callback
 * 2. Nach erfolgreicher Verarbeitung → Redirect zur App
 * 3. Bei Fehler → Redirect zu /welcome
 */
export const SSOCallbackPage: React.FC = () => {
  const { handleRedirectCallback } = useClerk();
  const navigate = useNavigate();

  useEffect(() => {
    async function handleCallback() {
      try {
        console.log('[SSOCallback] Processing OAuth callback...');
        console.log('[SSOCallback] URL:', window.location.href.substring(0, 200));

        await handleRedirectCallback();

        console.log('[SSOCallback] OAuth callback handled successfully');
        navigate('/tabs/categories', { replace: true });
      } catch (error) {
        console.error('[SSOCallback] OAuth callback error:', error);
        navigate('/welcome', { replace: true });
      }
    }

    handleCallback();
  }, [handleRedirectCallback, navigate]);

  return (
    <div className="cookly-page cookly-page--no-nav flex items-center justify-center min-h-screen bg-white dark:bg-background-dark">
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
