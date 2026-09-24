import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuthActions } from '@convex-dev/auth/react';
import { AppleSignIn, ErrorCode, SignInScope } from '@capawesome/capacitor-apple-sign-in';
import { capture } from '../services/analytics';
import { logger } from '../utils/logger';
import { createUuid } from '../utils/uuid';

const isIos = Capacitor.getPlatform() === 'ios';

interface AppleSignInButtonProps {
  className?: string;
  onError?: (message: string) => void;
}

/**
 * Native Sign in with Apple (nur iOS, App Store Guideline 4.8).
 * Nach erfolgreichem signIn navigieren die Seiten selbst über isAuthenticated.
 */
export const AppleSignInButton: React.FC<AppleSignInButtonProps> = ({ className = '', onError }) => {
  const { signIn } = useAuthActions();
  const [loading, setLoading] = useState(false);

  if (!isIos) return null;

  const handleClick = async () => {
    capture('signin_started', { method: 'apple' });
    setLoading(true);
    try {
      const nonce = createUuid();
      const result = await AppleSignIn.signIn({ scopes: [SignInScope.Email, SignInScope.FullName], nonce });
      await signIn('apple', {
        idToken: result.idToken,
        nonce,
        authorizationCode: result.authorizationCode,
        givenName: result.givenName ?? '',
        familyName: result.familyName ?? '',
      });
      capture('signin_succeeded', { method: 'apple' });
    } catch (error) {
      if ((error as { code?: string })?.code === ErrorCode.SignInCanceled) return;
      logger.warn('Auth', 'Apple sign-in failed', error);
      capture('signin_failed', { method: 'apple', errorCode: 'AUTH_REJECTED' });
      onError?.('Die Anmeldung mit Apple hat nicht geklappt. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`w-full flex items-center justify-center gap-3 bg-black text-white font-medium px-4 transition-opacity hover:opacity-90 disabled:opacity-50 ${className}`}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.37 12.75c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.63 1.11 8.8.73 1.06 1.6 2.25 2.75 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.67-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.33-3.57zM14.18 6.28c.61-.74 1.02-1.76.91-2.78-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.69-.93 2.69.98.08 1.98-.5 2.59-1.23z" />
      </svg>
      <span>{loading ? 'Wird geladen...' : 'Mit Apple anmelden'}</span>
    </button>
  );
};

export default AppleSignInButton;
