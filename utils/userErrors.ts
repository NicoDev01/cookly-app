export type UserErrorContext =
  | 'auth-signin'
  | 'auth-signup'
  | 'auth-reset'
  | 'save'
  | 'import'
  | 'image'
  | 'billing'
  | 'generic';

type StructuredError = {
  type?: string;
  feature?: string;
  current?: number;
  limit?: number;
  message?: string;
};

const INVALID_CREDENTIALS_MESSAGE = 'E-Mail oder Passwort ist falsch.';
const RATE_LIMIT_MESSAGE = 'Zu viele fehlgeschlagene Anmeldeversuche. Bitte warte kurz und versuche es erneut.';
const NETWORK_MESSAGE = 'Keine Verbindung. Prüfe dein Internet und versuche es erneut.';
const DUPLICATE_SIGNUP_MESSAGE = 'Diese E-Mail ist bereits registriert. Möchtest du dich anmelden?';
const INVALID_CODE_MESSAGE = 'Der Code ist ungültig oder abgelaufen. Fordere einen neuen an.';

const fallbackByContext: Record<UserErrorContext, string> = {
  'auth-signin': 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.',
  'auth-signup': 'Registrierung fehlgeschlagen. Bitte versuche es erneut.',
  'auth-reset': 'Passwort zurücksetzen hat nicht geklappt. Bitte versuche es erneut.',
  save: 'Speichern hat nicht geklappt. Bitte versuche es erneut.',
  import: 'Import hat nicht geklappt. Bitte versuche es erneut.',
  image: 'Das Bild konnte nicht verarbeitet werden. Bitte versuche es erneut.',
  billing: 'Abo-Aktion hat nicht geklappt. Bitte versuche es erneut.',
  generic: 'Etwas hat nicht geklappt. Bitte versuche es erneut.',
};

const getErrorText = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? '');
};

const parseJsonObjectFromText = (text: string): StructuredError | null => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const getStructuredUserError = (error: unknown): StructuredError | null =>
  parseJsonObjectFromText(getErrorText(error));

export const stripErrorNoise = (error: unknown) => {
  let text = getErrorText(error).trim();

  const structured = parseJsonObjectFromText(text);
  if (structured) return JSON.stringify(structured);

  text = text
    .replace(/\[CONVEX[^\]]*\]\s*/g, '')
    .replace(/\[Request ID:[^\]]*\]\s*/g, '')
    .replace(/Server Error:\s*/gi, '')
    .replace(/Uncaught Error:\s*/gi, '')
    .replace(/^Error:\s*/i, '')
    .trim();

  return text;
};

const includesAny = (text: string, patterns: string[]) =>
  patterns.some((pattern) => text.includes(pattern.toLowerCase()));

const getLimitMessage = (errorData: StructuredError) => {
  if (typeof errorData.message === 'string' && errorData.message.trim()) {
    return errorData.message.trim();
  }
  if (errorData.feature === 'manual_recipes') return 'Manuelle Rezepte sind unbegrenzt.';
  if (errorData.feature === 'photo_scans') return 'Du hast dein Limit für Foto-Scans erreicht.';
  return 'Du hast dein Import-Limit erreicht.';
};

const mapStructuredError = (errorData: StructuredError): string | null => {
  if (errorData.type === 'LIMIT_REACHED') return getLimitMessage(errorData);
  if (errorData.type === 'RATE_LIMIT_EXCEEDED') return 'Du hast zu viele Anfragen gestellt. Bitte warte einen Moment.';
  if (errorData.type === 'PROVIDER_BUDGET_EXHAUSTED') return 'Der Importdienst ist für heute ausgelastet. Bitte versuche es morgen erneut.';
  if (errorData.type === 'IMPORT_TIMEOUT') return 'Der Import läuft länger als erwartet. Öffne den geteilten Link erneut, um den Status fortzusetzen.';
  if (errorData.type === 'API_UNAVAILABLE') {
    return errorData.message?.trim() || 'Der Service ist gerade nicht verfügbar. Bitte versuche es gleich erneut.';
  }
  if (errorData.type === 'NO_RECIPE_CONTENT') {
    return errorData.message?.trim() || 'Im geteilten Inhalt wurde kein vollständiges Rezept gefunden.';
  }
  if (errorData.type === 'POST_UNAVAILABLE') {
    return errorData.message?.trim() || 'Dieser Beitrag ist privat oder wurde gelöscht.';
  }
  return null;
};

export const getUserErrorMessage = (error: unknown, context: UserErrorContext = 'generic') => {
  const structured = getStructuredUserError(error);
  if (structured) {
    const mapped = mapStructuredError(structured);
    if (mapped) return mapped;
  }

  const text = stripErrorNoise(error).toLowerCase();

  if (includesAny(text, ['failed to fetch', 'networkerror', 'network error', 'connection lost', 'offline'])) {
    return NETWORK_MESSAGE;
  }

  if (text.includes('toomanyfailedattempts')) {
    return RATE_LIMIT_MESSAGE;
  }

  if (text.includes('account_deletion_failed')) {
    return 'Das Konto konnte noch nicht vollständig gelöscht werden. Bitte versuche es erneut.';
  }

  if (context === 'auth-signin' && includesAny(text, ['invalidaccountid', 'invalidsecret'])) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  if (context === 'auth-signup' && includesAny(text, ['invalidaccountid', 'already exists', 'account already', 'already registered'])) {
    return DUPLICATE_SIGNUP_MESSAGE;
  }

  if (context === 'auth-reset' && includesAny(text, ['invalid code', 'invalid verification', 'expired', 'verification code', 'reset code'])) {
    return INVALID_CODE_MESSAGE;
  }

  if (context === 'import') {
    if (includesAny(text, ['no data found', 'parse recipe data', 'no recipe'])) return 'Kein Rezept gefunden.';
    if (text.includes('jina ai request failed')) return 'Website konnte nicht geladen werden.';
    if (includesAny(text, ['invalid_instagram_url', 'invalid_facebook_url', 'invalid_tiktok_url'])) return 'Dieser Link wird nicht unterstützt.';
  }

  return fallbackByContext[context];
};
