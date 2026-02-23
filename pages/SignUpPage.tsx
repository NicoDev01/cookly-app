import React, { useState, useEffect } from 'react';
import { useSignUp, useAuth } from '@clerk/clerk-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Input, IconButton } from '../components/ui/cookly';

export const SignUpPage: React.FC = () => {
  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const navigate = useNavigate();
  const currentUser = useQuery(api.users.getCurrentUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (authLoaded && isSignedIn) {
      if (currentUser) {
        navigate('/tabs/categories');
      }
    }
  }, [authLoaded, isSignedIn, currentUser, navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpLoaded) return;

    setLoading(true);
    setError('');

    if (isSignedIn) {
      navigate('/onboarding');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      setLoading(false);
      return;
    }

    try {
      const result = await signUp.create({
        emailAddress: email,
        password,
      });

      if (result.status === 'missing_requirements') {
        setShowCodeInput(true);
        setError('');
      } else if (result.status === 'complete') {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        navigate('/onboarding');
      }
    } catch (err: unknown) {
      let errorMessage = 'Registrierung fehlgeschlagen. Bitte versuche es erneut.';

      if (err && typeof err === 'object') {
        if ('errors' in err && Array.isArray(err.errors)) {
          const clerkError = err as { errors: Array<{ message?: string; longMessage?: string; code?: string }> };

          const alreadySignedIn = clerkError.errors.some(e => e.code === 'session_exists');

          if (alreadySignedIn) {
            navigate('/onboarding');
            return;
          }

          const allMessages = clerkError.errors
            .map(e => e.longMessage || e.message)
            .filter(Boolean);
          if (allMessages.length > 0) {
            errorMessage = allMessages.join('\n');
          }
        }
        else if ('message' in err && typeof err.message === 'string') {
          errorMessage = err.message;
        }
        else if (toString.call(err) === '[object String]') {
          errorMessage = String(err);
        }
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpLoaded) return;

    setLoading(true);
    setError('');

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (result.status === 'complete') {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        navigate('/onboarding');
      }
    } catch (err: unknown) {
      let errorMessage = 'Verifizierung fehlgeschlagen. Bitte prüfe den Code.';

      if (err && typeof err === 'object') {
        if ('errors' in err && Array.isArray(err.errors)) {
          const clerkError = err as { errors: Array<{ message?: string; longMessage?: string; code?: string }> };
          const allMessages = clerkError.errors
            .map(e => e.longMessage || e.message)
            .filter(Boolean);
          if (allMessages.length > 0) {
            errorMessage = allMessages.join('\n');
          }
        }
        else if ('message' in err && typeof err.message === 'string') {
          errorMessage = err.message;
        }
        else if (toString.call(err) === '[object String]') {
          errorMessage = String(err);
        }
      }

      setError(errorMessage);
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
          {showCodeInput ? 'Code bestätigen' : 'Registrieren'}
        </h1>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* Registration Form */}
        {!showCodeInput ? (
          <form onSubmit={handleSignUp} className="space-y-5">
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
                minLength={8}
                placeholder="Mindestens 8 Zeichen"
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

            <div className="relative">
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                label="Passwort bestätigen"
                icon="lock"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Passwort wiederholen"
                className="pr-12"
              />
              <div className="absolute right-2 top-[calc(50%+10px)] -translate-y-1/2">
                <IconButton
                  icon={showConfirmPassword ? 'visibility_off' : 'visibility'}
                  variant="default"
                  size="sm"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#b2c8ba] text-white font-medium py-3 mt-8 disabled:opacity-50 transition-transform active:scale-95"
            >
              {loading ? 'Wird geladen...' : 'Registrieren'}
            </button>
          </form>
        ) : (
          /* Verification Code Form */
          <form onSubmit={handleVerifyCode} className="space-y-5">
            <p className="cookly-text-caption text-center mb-2">
              Wir haben einen Code an <strong>{email}</strong> gesendet.
            </p>

            <p className="cookly-text-caption text-center mb-6">
              Gib ihn hier ein:
            </p>

            <Input
              type="text"
              label="Verifizierungscode"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="123456"
              maxLength={6}
              className="text-center text-lg tracking-widest"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#b2c8ba] text-white font-medium py-3 mt-6 disabled:opacity-50 transition-transform active:scale-95"
            >
              {loading ? 'Wird verifiziert...' : 'Bestätigen'}
            </button>

            <button
              type="button"
              onClick={() => setShowCodeInput(false)}
              className="w-full rounded-full text-[#b2c8ba] font-medium py-3 mt-2 hover:bg-[#b2c8ba]/10 transition-colors"
            >
              Zurück
            </button>
          </form>
        )}

        {/* Link to Sign In */}
        <div className="mt-8 text-center">
          <Link
            to="/sign-in"
            className="text-sm font-medium text-[#b2c8ba] hover:underline"
          >
            Bereits ein Konto? Jetzt anmelden
          </Link>
        </div>

        {/* Terms */}
        <div className="text-center mt-12">
          <p className="cookly-text-caption text-xs">
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
      </div>
    </div>
  );
};

export default SignUpPage;
