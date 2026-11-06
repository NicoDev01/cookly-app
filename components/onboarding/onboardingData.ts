export const ONB_IMG = {
  start: '/onboarding/start.webp',
  icon: '/onboarding/app-icon.png',
  logo: '/logo.png',
  hello: '/onboarding/pot-hello.webp',
  nice: '/onboarding/pot-nice.webp',
  setup: '/onboarding/pot-setup.webp',
  account: '/onboarding/pot-account.webp',
  bell: '/onboarding/pot-bell.webp',
  pro: '/onboarding/pot-pro.webp',
};

export const SETUP_TICKS = [
  'Kochbuch für dich vorbereitet',
  'Importe für Social Media & Web bereit',
  'Foto-Importe verfügbar',
  'Kochbuch personalisiert',
];

export const PRO_FEATURES = [
  'Unbegrenzt Rezepte speichern',
  'Unbegrenzte Social-Media-Importe',
  'Unbegrenzte Website-Importe',
  'Unbegrenzt Rezepte per Foto',
  'Jederzeit kündbar',
];

export type OnboardingAnswers = {
  name: string;
  sources: string[];
  goals: string[];
  /** Selbstauskunft „Wie hast du von Cookly erfahren?“ (leer = übersprungen). */
  referral: string;
};

const STORAGE_KEY = 'cookly:onboarding-answers';

/** Antworten vor dem Login liegen nur lokal; nach dem Login speichert /onboarding sie in Convex. */
export function loadAnswers(): OnboardingAnswers | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingAnswers>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      sources: Array.isArray(parsed.sources) ? parsed.sources.filter((s) => typeof s === 'string') : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals.filter((s) => typeof s === 'string') : [],
      referral: typeof parsed.referral === 'string' ? parsed.referral : '',
    };
  } catch {
    return null;
  }
}

export function saveAnswers(answers: OnboardingAnswers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // Ohne Storage gehen nur die Antworten verloren, das Onboarding läuft weiter.
  }
}

export function clearAnswers() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorieren
  }
}

const DEVICE_KEY = 'cookly:account-on-device';

/** Merkt sich, dass auf diesem Gerät schon jemand angemeldet war: Ausgeloggte kommen dann zum Login statt ins Onboarding. */
export function hasAccountOnDevice(): boolean {
  try {
    return localStorage.getItem(DEVICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAccountOnDevice() {
  try {
    localStorage.setItem(DEVICE_KEY, '1');
  } catch {
    // ignorieren
  }
}

/** Nach dem Löschen des Kontos startet das Gerät wieder wie neu. */
export function forgetAccountOnDevice() {
  clearAnswers();
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    // ignorieren
  }
}

export const loggedOutHome = () => (hasAccountOnDevice() ? '/sign-in' : '/welcome');
