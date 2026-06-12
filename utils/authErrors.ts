const INVALID_CREDENTIALS_MESSAGE = 'E-Mail oder Passwort ist falsch.';
const RATE_LIMIT_MESSAGE = 'Zu viele fehlgeschlagene Anmeldeversuche. Bitte warte kurz und versuche es erneut.';
const GENERIC_SIGN_IN_MESSAGE = 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.';

const getErrorText = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
};

export const getPasswordSignInErrorMessage = (error: unknown) => {
  const errorText = getErrorText(error);

  if (errorText.includes('TooManyFailedAttempts')) {
    return RATE_LIMIT_MESSAGE;
  }

  if (errorText.includes('InvalidAccountId') || errorText.includes('InvalidSecret')) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  return GENERIC_SIGN_IN_MESSAGE;
};
