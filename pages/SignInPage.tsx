import React, { useState, useEffect } from 'react';
import { useSignIn, useAuth } from '@clerk/clerk-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

export const SignInPage: React.FC = () => {
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const navigate = useNavigate();
  const currentUser = useQuery(api.users.getCurrentUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoaded && isSignedIn) {
      if (currentUser) {
        navigate('/tabs/categories');
      }
    }
  }, [authLoaded, isSignedIn, currentUser, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInLoaded || !signIn) return;

    setLoading(true);
    setError('');

    if (isSignedIn) {
      navigate('/tabs/categories');
      return;
    }

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/tabs/categories');
      } else if (result.status === 'needs_first_factor') {
        setError('Bitte bestätige deine E-Mail');
      }
    } catch (err: unknown) {
      console.error('SignIn Error:', err);

      let errorMessage = 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.';

      if (err && typeof err === 'object') {
        if ('errors' in err && Array.isArray(err.errors)) {
          const clerkError = err as { errors: Array<{ code?: string; message?: string; longMessage?: string }> };

          const alreadySignedIn = clerkError.errors.some(e => e.code === 'session_exists');
          if (alreadySignedIn) {
            navigate('/tabs/categories');
            return;
          }

          const invalidStrategy = clerkError.errors.some(e => 
            e.message?.includes('verification strategy') || 
            e.code === 'strategy_for_user_invalid'
          );
          if (invalidStrategy) {
            errorMessage = 'Sitzungsfehler. Bitte lade die Seite neu.';
            setTimeout(() => window.location.reload(), 1500);
          } else {
            const allMessages = clerkError.errors
              .map(e => e.longMessage || e.message)
              .filter(Boolean);
            if (allMessages.length > 0) {
              errorMessage = allMessages.join('\n');
            }
          }
        } else if ('message' in err && typeof err.message === 'string') {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background-light to-secondary/10 dark:from-primary/20 dark:via-background-dark dark:to-secondary/20 p-4">
      <div className="w-full max-w-md">
        {/* Logo Header */}
        <div className="flex justify-center mb-8">
          <img
            src="/logo.png"
            alt="Cookly"
            className="h-12 w-auto"
          />
        </div>

        <div className="text-center mb-8">
          <p className="text-text-secondary-light dark:text-text-secondary-dark">
            Deine KI-gestützte Rezept-App
          </p>
        </div>

        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-6">
            Anmelden
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm whitespace-pre-wrap">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
                E-Mail
              </label>
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark"
                placeholder="deine@email.de"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
                Passwort
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Wird geladen...' : 'Anmelden'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/sign-up"
              className="text-primary hover:underline font-medium"
            >
              Noch kein Konto? Jetzt registrieren
            </Link>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
            Mit der Anmeldung stimmst du unseren{' '}
            <a href="/terms" className="text-primary hover:underline">
              Nutzungsbedingungen
            </a>{' '}
            und der{' '}
            <a href="/privacy" className="text-primary hover:underline">
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
