import React, { useState, useEffect } from 'react';
import { useSignUp, useAuth } from '@clerk/clerk-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Input, Button, IconButton, Card, CardContent } from '../components/ui/cookly';

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
  const [devCode, setDevCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (authLoaded && isSignedIn) {
      if (currentUser) {
        navigate('/');
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
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        navigate('/onboarding');
      }
    } catch (err: unknown) {
      console.error('SignUp Error - Full object:', JSON.stringify(err, null, 2));
      console.error('SignUp Error - Keys:', err ? Object.keys(err) : 'err is null/undefined');

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
      console.error('Verification Error - Full object:', JSON.stringify(err, null, 2));
      console.error('Verification Error - Keys:', err ? Object.keys(err) : 'err is null/undefined');

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
            Starte deine Rezept-Sammlung
          </p>
        </div>

        <Card variant="elevated" className="p-6">
          <CardContent className="p-0">
            <h2 className="cookly-text-title mb-6">
              {showCodeInput ? 'Code bestätigen' : 'Registrieren'}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm whitespace-pre-wrap">
                {error}
              </div>
            )}

            {!showCodeInput ? (
              <form onSubmit={handleSignUp} className="space-y-4">
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

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={loading}
                  className="mt-6"
                >
                  {loading ? 'Wird geladen...' : 'Registrieren'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <p className="cookly-text-caption mb-2">
                  Wir haben einen Code an <strong>{email}</strong> gesendet.
                </p>

                {devCode && (
                  <div className="mb-4 p-3 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-lg text-sm border border-yellow-300 dark:border-yellow-700">
                    <p className="font-medium mb-1">🔧 Development Mode:</p>
                    <p className="text-xs">{devCode}</p>
                    <p className="text-xs mt-2">Oder prüfe den Logcat für Details.</p>
                  </div>
                )}

                <p className="cookly-text-caption mb-4">
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

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={loading}
                >
                  {loading ? 'Wird verifiziert...' : 'Bestätigen'}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  fullWidth
                  onClick={() => setShowCodeInput(false)}
                >
                  Zurück
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Link
                to="/sign-in"
                className="text-sm font-medium text-[hsl(146,17%,74%)] hover:underline"
              >
                Bereits ein Konto? Jetzt anmelden
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6 px-4">
          <p className="cookly-text-caption">
            Mit der Registrierung stimmst du unseren{' '}
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

export default SignUpPage;
