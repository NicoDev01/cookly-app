import React, { useState, useEffect } from 'react';
import { useSignIn, useAuth } from '@clerk/clerk-react';
import { Link, useNavigate } from 'react-router-dom';
import { Input, Button, IconButton, Card, CardContent } from '../components/ui/cookly';

type Phase = 'email' | 'reset';

export const ForgotPasswordPage: React.FC = () => {
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const navigate = useNavigate();

  // Phase 1: Email input
  const [email, setEmail] = useState('');
  
  // Phase 2: Code and password input
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // UI State
  const [phase, setPhase] = useState<Phase>('email');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already signed in
  useEffect(() => {
    if (authLoaded && isSignedIn) {
      navigate('/tabs/categories');
    }
  }, [authLoaded, isSignedIn, navigate]);

  // Phase 1: Send reset code
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInLoaded || !signIn) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });

      setSuccess('Ein Reset-Code wurde an deine E-Mail gesendet.');
      setPhase('reset');
    } catch (err: unknown) {
      console.error('Send Reset Code Error:', err);

      let errorMessage = 'Fehler beim Senden des Reset-Codes. Bitte versuche es erneut.';

      if (err && typeof err === 'object') {
        if ('errors' in err && Array.isArray(err.errors)) {
          const clerkError = err as { errors: Array<{ code?: string; message?: string; longMessage?: string }> };
          const allMessages = clerkError.errors
            .map(e => e.longMessage || e.message)
            .filter(Boolean);
          if (allMessages.length > 0) {
            errorMessage = allMessages.join('\n');
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

  // Phase 2: Reset password with code
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInLoaded || !signIn) return;

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    // Validate password strength (minimum 8 characters)
    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/tabs/categories');
      } else {
        setError('Unerwarteter Status. Bitte versuche es erneut.');
      }
    } catch (err: unknown) {
      console.error('Reset Password Error:', err);

      let errorMessage = 'Fehler beim Zurücksetzen des Passworts. Bitte versuche es erneut.';

      if (err && typeof err === 'object') {
        if ('errors' in err && Array.isArray(err.errors)) {
          const clerkError = err as { errors: Array<{ code?: string; message?: string; longMessage?: string }> };
          const allMessages = clerkError.errors
            .map(e => e.longMessage || e.message)
            .filter(Boolean);
          if (allMessages.length > 0) {
            errorMessage = allMessages.join('\n');
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

        <Card variant="elevated" className="p-6">
          <CardContent className="p-0">
            <h2 className="cookly-text-title mb-2">
              {phase === 'email' ? 'Passwort vergessen?' : 'Passwort zurücksetzen'}
            </h2>
            <p className="cookly-text-caption mb-6">
              {phase === 'email' 
                ? 'Gib deine E-Mail-Adresse ein, um einen Reset-Code zu erhalten.'
                : 'Gib den Code aus der E-Mail und dein neues Passwort ein.'}
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm whitespace-pre-wrap">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm whitespace-pre-wrap">
                {success}
              </div>
            )}

            {phase === 'email' ? (
              // Phase 1: Email Input
              <form onSubmit={handleSendCode} className="space-y-4">
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

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={loading}
                  className="mt-6"
                >
                  {loading ? 'Wird gesendet...' : 'Reset-Code senden'}
                </Button>
              </form>
            ) : (
              // Phase 2: Code and Password Input
              <form onSubmit={handleResetPassword} className="space-y-4">
                <Input
                  type="text"
                  label="Reset-Code"
                  icon="key"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  placeholder="XXXXXX"
                  helper="Gib den 6-stelligen Code aus der E-Mail ein"
                />

                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    label="Neues Passwort"
                    icon="lock"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="pr-12"
                    helper="Mindestens 8 Zeichen"
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
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
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
                  {loading ? 'Wird zurückgesetzt...' : 'Passwort zurücksetzen'}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Link
                to="/sign-in"
                className="text-sm font-medium text-[hsl(146,17%,74%)] hover:underline"
              >
                Zurück zum Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
