import React, { useState, useEffect } from 'react';
import { useSignIn, useAuth } from '@clerk/clerk-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Input, Button, IconButton, Card, CardContent } from '../components/ui/cookly';

export const SignInPage: React.FC = () => {
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const navigate = useNavigate();
  const currentUser = useQuery(api.users.getCurrentUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="cookly-page cookly-page--no-nav flex items-center justify-center">
      <div className="w-full max-w-md px-4">
        {/* Logo Header */}
        <div className="flex justify-center mb-8">
          <img
            src="/logo.png"
            alt="Cookly"
            className="h-12 w-auto"
          />
        </div>

        <div className="text-center mb-8">
          <p className="cookly-text-caption">
            Deine KI-gestützte Rezept-App
          </p>
        </div>

        <Card variant="elevated" className="p-6">
          <CardContent className="p-0">
            <h2 className="cookly-text-title mb-6">
              Anmelden
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm whitespace-pre-wrap">
                {error}
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
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

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                className="mt-6"
              >
                {loading ? 'Wird geladen...' : 'Anmelden'}
              </Button>

              <div className="text-center mt-4">
                <Link
                  to="/forgot-password"
                  className="text-sm text-[hsl(146,17%,74%)] hover:underline"
                >
                  Passwort vergessen?
                </Link>
              </div>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/sign-up"
                className="text-sm font-medium text-[hsl(146,17%,74%)] hover:underline"
              >
                Noch kein Konto? Jetzt registrieren
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6 px-4">
          <p className="cookly-text-caption">
            Mit der Anmeldung stimmst du unseren{' '}
            <a href="/terms" className="text-[hsl(146,17%,74%)] hover:underline">
              Nutzungsbedingungen
            </a>{' '}
            und der{' '}
            <a href="/privacy" className="text-[hsl(146,17%,74%)] hover:underline">
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
