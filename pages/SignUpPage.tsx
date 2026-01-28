import React, { useState, useEffect } from 'react';
import { useSignUp, useAuth } from '@clerk/clerk-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

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
  const [devCode, setDevCode] = useState(''); // Dev-Mode: Zeigt den Verification Code an
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Wenn User bereits bei Clerk eingeloggt ist
  useEffect(() => {
    if (authLoaded && isSignedIn) {
      // User ist bereits eingeloggt - warte auf Convex Sync oder navigiere direkt
      if (currentUser) {
        // User ist komplett sync'd - zur App
        navigate('/');
      }
      // Wenn kein currentUser: Wir warten einfach (App.tsx ProtectedRoute wird es handhaben)
    }
  }, [authLoaded, isSignedIn, currentUser, navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpLoaded) return;

    setLoading(true);
    setError('');

    // Prüfe ob User bereits eingeloggt ist
    if (isSignedIn) {
      // Bereits eingeloggt - direkt zum Onboarding
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
        // Clerk sendet Verifikations-Code per E-Mail
        setShowCodeInput(true);
        setError('');

        // DEV-MODE: Versuche, den Code aus dem Clerk-Objekt zu extrahieren
        console.log('=== DEV MODE: Verification Info ===');
        console.log('signUp object:', signUp);
        console.log('result object:', result);

        const pendingEmail = signUp.emailAddress;
        if (pendingEmail) {
          console.log('=== DEV INSTRUCTIONS ===');
          console.log('1. Gehe zu: https://dashboard.clerk.com');
          console.log('2. Öffne deine App (joint-mollusk-58)');
          console.log('3. Klicke links auf "Users"');
          console.log(`4. Suche nach: ${email}`);
          console.log('5. Klicke auf den User → "Email" Tab');
          console.log('6. Der Verification Code steht dort!');

          setDevCode('📧 Prüfe dein Clerk Dashboard → Users → Deine Email → Email Tab');
        }
      } else if (result.status === 'complete') {
        // Registrierung erfolgreich! - Session setzen und zum Onboarding
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        // Warte kurz damit der Auth State aktualisiert wird
        await new Promise(resolve => setTimeout(resolve, 100));
        navigate('/onboarding');
      }
    } catch (err: unknown) {
      // Detailliertes Error Logging für Debugging
      console.error('SignUp Error - Full object:', JSON.stringify(err, null, 2));
      console.error('SignUp Error - Keys:', err ? Object.keys(err) : 'err is null/undefined');

      let errorMessage = 'Registrierung fehlgeschlagen. Bitte versuche es erneut.';

      // Clerk Error Handling - Verschiedene Error-Formate
      if (err && typeof err === 'object') {
        // Clerk ClerkAPIResponseError Format - Zeige ALLE Fehler
        if ('errors' in err && Array.isArray(err.errors)) {
          const clerkError = err as { errors: Array<{ message?: string; longMessage?: string; code?: string }> };

          // Prüfe auf "session_exists" - User ist bereits eingeloggt
          const alreadySignedIn = clerkError.errors.some(e => e.code === 'session_exists');

          if (alreadySignedIn) {
            // User ist bereits eingeloggt - direkt zum Onboarding
            navigate('/onboarding');
            return;
          }

          // Alle Fehlermeldungen sammeln
          const allMessages = clerkError.errors
            .map(e => e.longMessage || e.message)
            .filter(Boolean);
          if (allMessages.length > 0) {
            errorMessage = allMessages.join('\n');
          }
        }
        // Standard Error Format
        else if ('message' in err && typeof err.message === 'string') {
          errorMessage = err.message;
        }
        // String Error
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
        // Registrierung abgeschlossen - Session setzen und zum Onboarding
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        // Warte kurz damit der Auth State aktualisiert wird
        await new Promise(resolve => setTimeout(resolve, 100));
        navigate('/onboarding');
      }
    } catch (err: unknown) {
      // Detailliertes Error Logging für Debugging
      console.error('Verification Error - Full object:', JSON.stringify(err, null, 2));
      console.error('Verification Error - Keys:', err ? Object.keys(err) : 'err is null/undefined');

      let errorMessage = 'Verifizierung fehlgeschlagen. Bitte prüfe den Code.';

      // Clerk Error Handling - Verschiedene Error-Formate
      if (err && typeof err === 'object') {
        // Clerk ClerkAPIResponseError Format - Zeige ALLE Fehler
        if ('errors' in err && Array.isArray(err.errors)) {
          const clerkError = err as { errors: Array<{ message?: string; longMessage?: string; code?: string }> };
          // Alle Fehlermeldungen sammeln
          const allMessages = clerkError.errors
            .map(e => e.longMessage || e.message)
            .filter(Boolean);
          if (allMessages.length > 0) {
            errorMessage = allMessages.join('\n');
          }
        }
        // Standard Error Format
        else if ('message' in err && typeof err.message === 'string') {
          errorMessage = err.message;
        }
        // String Error
        else if (toString.call(err) === '[object String]') {
          errorMessage = String(err);
        }
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSignInRedirect = () => {
    navigate('/sign-in');
  };

  // Custom Registration Form - funktioniert auf allen Plattformen
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background-light to-secondary/10 dark:from-primary/20 dark:via-background-dark dark:to-secondary/20 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">Cookly</h1>
          <p className="text-text-secondary-light dark:text-text-secondary-dark">
            Starte deine Rezept-Sammlung
          </p>
        </div>

        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-6">
            {showCodeInput ? 'Code bestätigen' : 'Registrieren'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm whitespace-pre-wrap">
              {error}
            </div>
          )}

          {!showCodeInput ? (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
                  E-Mail
                </label>
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
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
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark"
                    placeholder="Mindestens 8 Zeichen"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
                    aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
                  Passwort bestätigen
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark"
                    placeholder="Passwort wiederholen"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
                    aria-label={showConfirmPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  >
                    {showConfirmPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Wird geladen...' : 'Registrieren'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark mb-2">
                Wir haben einen Code an <strong>{email}</strong> gesendet.
              </p>

              {/* DEV-MODE Hilfestellung */}
              {devCode && (
                <div className="mb-4 p-3 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-lg text-sm border border-yellow-300 dark:border-yellow-700">
                  <p className="font-medium mb-1">🔧 Development Mode:</p>
                  <p className="text-xs">{devCode}</p>
                  <p className="text-xs mt-2">Oder prüfe den Logcat für Details.</p>
                </div>
              )}

              <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark mb-4">
                Gib ihn hier ein:
              </p>

              <div>
                <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
                  Verifizierungscode
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark text-center text-lg tracking-widest"
                  placeholder="123456"
                  maxLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Wird verifiziert...' : 'Bestätigen'}
              </button>

              <button
                type="button"
                onClick={() => setShowCodeInput(false)}
                className="w-full py-3 px-4 text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
              >
                Zurück
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/sign-in"
              className="text-primary hover:underline font-medium"
            >
              Bereits ein Konto? Jetzt anmelden
            </Link>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
            Mit der Registrierung stimmst du unseren{' '}
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

export default SignUpPage;
