import React, { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Link, useNavigate } from 'react-router-dom';
import { Input, IconButton } from '../components/ui/cookly';
import { getPasswordSignInErrorMessage } from '../utils/authErrors';
import { logger } from '../utils/logger';
import { capture } from '../services/analytics';
import { startGoogleOAuth } from '../services/googleOAuth';

export const SignInPage: React.FC = () => {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/tabs/categories', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    void StatusBar.setBackgroundColor({ color: '#f0f2f5' });
    void StatusBar.setStyle({ style: Style.Dark });
  }, []);

  const handleGoogleSignIn = async () => {
    capture('signin_started', { method: 'google' });
    setGoogleLoading(true);
    try {
      await startGoogleOAuth(() => signIn('google'));
    } catch (error) {
      logger.warn('Auth', 'Google OAuth failed', error);
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    capture('signin_started', { method: 'password' });

    try {
      await signIn('password', { email, password, flow: 'signIn' });
      capture('signin_succeeded', { method: 'password' });
      navigate('/tabs/categories', { replace: true });
    } catch (err: unknown) {
      logger.warn('Auth', 'Password sign-in failed', err);
      capture('signin_failed', { method: 'password', errorCode: 'AUTH_REJECTED' });
      setError(getPasswordSignInErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cookly-page cookly-page--no-nav flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        {/* Logo */}
        <div className="flex justify-center mb-12">
          <img
            src="/logo.png"
            alt="Cookly"
            className="h-12 w-auto"
          />
        </div>

        {/* Titel */}
        <h1 className="cookly-text-title text-center mb-8">
          Anmelden
        </h1>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-full px-4 py-3 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 mb-4"
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
          <span>{googleLoading ? 'Wird geladen...' : 'Mit Google anmelden'}</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          <span className="text-xs text-gray-400 dark:text-gray-500">oder</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Form */}
        <form onSubmit={handleSignIn} className="space-y-5">
          <Input
            type="email"
            label="E-Mail"
            icon="mail"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="deine@email.de"
          />

          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              label="Passwort"
              icon="lock"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="pr-12"
            />
            <div className="absolute right-2 top-[calc(50%+10px)] -translate-y-1/2">
              <IconButton
                icon={showPassword ? 'visibility_off' : 'visibility'}
                variant="default"
                size="sm"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#b2c8ba] text-white font-medium py-3 mt-8 disabled:opacity-50 transition-transform active:scale-95"
          >
            {loading ? 'Wird geladen...' : 'Anmelden'}
          </button>
        </form>

        {/* Links */}
        <div className="mt-8 text-center space-y-3">
          <Link
            to="/forgot-password"
            className="block text-sm text-[#b2c8ba] hover:underline"
          >
            Passwort vergessen?
          </Link>
          <Link
            to="/sign-up"
            className="block text-sm font-medium text-[#b2c8ba] hover:underline"
          >
            Noch kein Konto? Jetzt registrieren
          </Link>
        </div>

        {/* Terms */}
        <div className="text-center mt-12">
          <p className="cookly-text-caption text-xs">
            Mit der Anmeldung stimmst du unseren{' '}
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
      </div>
    </div>
  );
};

export default SignInPage;
