import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useAuthActions } from '@convex-dev/auth/react';
import { BookOpen, Calendar, Camera, Check, ChevronLeft, Ellipsis, Globe, Lightbulb, Mail, PenLine, Salad, Search, ShoppingCart, Smartphone, Users } from 'lucide-react';
import { SiFacebook, SiInstagram, SiPinterest, SiTiktok, SiYoutube } from 'react-icons/si';
import AppleSignInButton from '../AppleSignInButton';
import { startGoogleOAuth } from '../../services/googleOAuth';
import { capture } from '../../services/analytics';
import { useHaptic } from '../../hooks/useHaptic';
import { logger } from '../../utils/logger';
import { registerBackButtonOverride } from '../../services/backButtonOverride';
import { ImportDemo } from './ImportDemo';
import { OnboardingPaywall } from './OnboardingPaywall';
import { ONB_IMG, type OnboardingAnswers } from './onboardingData';
import { FREE_LIMITS } from '../../convex/constants';
import './onboarding.css';

export type StepId = 'start' | 'name' | 'sources' | 'demo' | 'goals' | 'referral' | 'setup' | 'account' | 'push' | 'paywall';
export const QUESTION_STEPS: StepId[] = ['name', 'sources', 'demo', 'goals', 'referral', 'setup'];
const PROGRESS_ORDER: StepId[] = ['name', 'sources', 'demo', 'goals', 'referral', 'setup', 'account', 'push'];

const SOURCES: Array<{ id: string; label: string; bg: string; icon: React.ReactNode }> = [
  { id: 'instagram', label: 'Instagram', bg: 'linear-gradient(45deg,#f58529,#dd2a7b 50%,#8134af 80%,#515bd4)', icon: <SiInstagram size={17} /> },
  { id: 'tiktok', label: 'TikTok', bg: '#000', icon: <SiTiktok size={17} /> },
  { id: 'facebook', label: 'Facebook', bg: '#0866FF', icon: <SiFacebook size={17} /> },
  { id: 'pinterest', label: 'Pinterest', bg: '#E60023', icon: <SiPinterest size={17} /> },
  { id: 'youtube', label: 'YouTube', bg: '#FF0000', icon: <SiYoutube size={17} /> },
  { id: 'web', label: 'Rezept-Websites', bg: '#2f5d46', icon: <Globe size={17} strokeWidth={2.1} /> },
  { id: 'photo', label: 'Kochbücher & Fotos', bg: '#e8873a', icon: <Camera size={17} strokeWidth={2.1} /> },
  { id: 'handwritten', label: 'Handschriftliche Rezepte', bg: '#8a6d4b', icon: <PenLine size={17} strokeWidth={2.1} /> },
];

// Jedes Ziel steht für eine Produktrichtung; die Verteilung zeigt, was wir ausbauen sollten.
const GOALS: Array<{ id: string; label: string; icon: React.ReactNode }> = [
  { id: 'all_in_one', label: 'Alle Rezepte an einem Ort', icon: <BookOpen size={18} /> },
  { id: 'plan_week', label: 'Meine Woche planen', icon: <Calendar size={18} /> },
  { id: 'shopping_list', label: 'Einkaufsliste aus Rezepten', icon: <ShoppingCart size={18} /> },
  { id: 'inspiration', label: 'Ideen, was ich heute koche', icon: <Lightbulb size={18} /> },
  { id: 'share', label: 'Rezepte mit Familie & Freunden teilen', icon: <Users size={18} /> },
  { id: 'healthy', label: 'Gesünder essen & Nährwerte', icon: <Salad size={18} /> },
];

const platform = Capacitor.getPlatform();
const STORE_LABEL = platform === 'ios' ? 'App Store' : platform === 'android' ? 'Google Play' : 'App Store / Google Play';

const REFERRALS: Array<{ id: string; label: string; bg: string; icon: React.ReactNode }> = [
  { id: 'instagram', label: 'Instagram', bg: 'linear-gradient(45deg,#f58529,#dd2a7b 50%,#8134af 80%,#515bd4)', icon: <SiInstagram size={17} /> },
  { id: 'tiktok', label: 'TikTok', bg: '#000', icon: <SiTiktok size={17} /> },
  { id: 'facebook', label: 'Facebook', bg: '#0866FF', icon: <SiFacebook size={17} /> },
  { id: 'youtube', label: 'YouTube', bg: '#FF0000', icon: <SiYoutube size={17} /> },
  { id: 'app_store', label: STORE_LABEL, bg: '#1d8cf8', icon: <Smartphone size={17} strokeWidth={2.1} /> },
  { id: 'web_search', label: 'Google-Suche', bg: '#2f5d46', icon: <Search size={17} strokeWidth={2.1} /> },
  { id: 'friends', label: 'Freunde & Familie', bg: '#e8873a', icon: <Users size={17} strokeWidth={2.1} /> },
  { id: 'other', label: 'Anderes', bg: '#8a8f8c', icon: <Ellipsis size={17} strokeWidth={2.1} /> },
];

const GOOGLE_G = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const isAndroid = platform === 'android';

const Ill: React.FC<{ src: string; h: number }> = ({ src, h }) => (
  <div className="onb-ill"><img src={src} alt="" style={{ height: h }} /></div>
);

type Props = {
  steps: StepId[];
  initialStep?: StepId;
  initialAnswers?: OnboardingAnswers | null;
  /** Wird beim Verlassen von „Einrichten“ aufgerufen. */
  onAnswersReady?: (answers: OnboardingAnswers) => void;
  onPushActivate?: () => Promise<void>;
  onFinish?: (result: 'free' | 'purchased') => Promise<void>;
};

export const OnboardingFlow: React.FC<Props> = ({ steps, initialStep, initialAnswers, onAnswersReady, onPushActivate, onFinish }) => {
  const navigate = useNavigate();
  const { signIn } = useAuthActions();
  const { impact } = useHaptic();
  const [index, setIndex] = useState(() => Math.max(0, initialStep ? steps.indexOf(initialStep) : 0));
  const [name, setName] = useState(initialAnswers?.name ?? '');
  const [greeted, setGreeted] = useState(false);
  const [greetedFromKeyboard, setGreetedFromKeyboard] = useState(false);
  const [sources, setSources] = useState<string[]>(initialAnswers?.sources ?? []);
  const [goals, setGoals] = useState<string[]>(initialAnswers?.goals ?? []);
  const [referral, setReferral] = useState(initialAnswers?.referral ?? '');
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const step = steps[index];
  const trimmedName = name.trim();
  const nameSuffix = trimmedName ? `, ${trimmedName}` : '';

  useEffect(() => {
    capture('onboarding_step_viewed', { step });
  }, [step]);

  // Systemleisten in Screen-Farbe; auf „Start“ liegt das Foto unter der Statusleiste.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const onPhoto = step === 'start';
    if (isAndroid) void StatusBar.setBackgroundColor({ color: onPhoto ? '#956754' : '#edf3ee' });
    void StatusBar.setStyle({ style: onPhoto ? Style.Dark : Style.Light });
  }, [step]);

  useEffect(() => () => {
    if (!Capacitor.isNativePlatform()) return;
    if (isAndroid) void StatusBar.setBackgroundColor({ color: '#f0f2f5' });
    void StatusBar.setStyle({ style: Style.Light });
  }, []);

  const answers = (): OnboardingAnswers => ({ name: trimmedName, sources, goals, referral });

  const next = () => {
    if (step === 'setup') onAnswersReady?.(answers());
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const back = () => {
    if (step === 'name' && greeted) {
      setGreeted(false);
      return;
    }
    setIndex((i) => Math.max(0, i - 1));
  };

  const greet = () => {
    if (!trimmedName) return;
    // Mit offener Tastatur bleibt die Frage im Tastatur-Layout, während sie ausblendet. Sonst wächst ihr Bild
    // beim Einfahren der Tastatur kurz wieder auf, bevor die Begrüßung erscheint.
    setGreetedFromKeyboard(document.documentElement.classList.contains('keyboard-open'));
    (document.activeElement as HTMLElement | null)?.blur();
    setGreeted(true);
  };

  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    void impact('light');
    set((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  };

  // Nur auswählen; weiter geht es bewusst über den Button.
  const pickReferral = (id: string) => {
    void impact('light');
    setReferral(id);
  };

  const google = async () => {
    setBusy(true);
    setAuthError('');
    capture('signin_started', { method: 'google' });
    try {
      await startGoogleOAuth(() => signIn('google'));
    } catch (error) {
      logger.warn('Auth', 'Google OAuth failed (onboarding)', error);
      setAuthError('Die Anmeldung mit Google hat nicht geklappt. Bitte versuche es erneut.');
      setBusy(false);
    }
  };

  // Android-Zurück verhält sich wie der Zurück-Pfeil; auf der Paywall wie Schließen,
  // auf dem ersten Screen wird die App minimiert (kein Sprung in die Tabs oder zum Login).
  const hardwareBackRef = useRef<() => void>(() => undefined);
  hardwareBackRef.current = () => {
    if (step === 'paywall') void onFinish?.('free');
    else if (index > 0 || (step === 'name' && greeted)) back();
    else void CapacitorApp.minimizeApp().catch(() => CapacitorApp.exitApp());
  };
  useEffect(() => registerBackButtonOverride(() => hardwareBackRef.current()), []);

  const activatePush = async () => {
    setBusy(true);
    try {
      await onPushActivate?.();
    } finally {
      setBusy(false);
      next();
    }
  };

  if (step === 'paywall') {
    return (
      <div className="onb"><div className="onb-col">
        <OnboardingPaywall onDone={async (result) => { await onFinish?.(result); }} />
      </div></div>
    );
  }

  const skip = <button type="button" className="onb-ghost" onClick={next}>Überspringen</button>;
  const progressIndex = PROGRESS_ORDER.indexOf(step);
  const pct = Math.round(((progressIndex + 1) / PROGRESS_ORDER.length) * 100);

  let body: React.ReactNode;
  let footer: React.ReactNode;

  switch (step) {
    case 'start':
      body = (
        <>
          <div className="onb-photo" style={{ backgroundImage: `url(${ONB_IMG.start})` }} />
          <div className="onb-start">
            <img className="onb-logo" src={ONB_IMG.logo} alt="Cookly" />
            <div className="onb-q">Alle deine Rezepte.<br />Ein Kochbuch.</div>
            <div className="onb-sub">Speichere Rezepte aus Instagram, TikTok und dem Web. Cookly macht daraus dein Lieblingsrezeptbuch.</div>
          </div>
        </>
      );
      footer = (
        <>
          <button type="button" className="onb-cta" onClick={next}>Los geht's</button>
          <button type="button" className="onb-ghost" onClick={() => navigate('/sign-in')}>Ich habe schon ein Konto</button>
        </>
      );
      break;
    case 'name':
      body = (
        <div className={`onb-swap${greeted ? ' done' : ''}${greeted && greetedFromKeyboard ? ' kb-frozen' : ''}`}>
          <div className="ask">
            <Ill src={ONB_IMG.hello} h={190} />
            <div className="onb-q">Wie dürfen wir dich nennen?</div>
            <input
              className="onb-input"
              placeholder="Dein Name"
              autoComplete="given-name"
              enterKeyHint="next"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') greet(); }}
            />
          </div>
          <div className="greet">
            <Ill src={ONB_IMG.nice} h={190} />
            <div className="onb-q">Schön, dich kennenzulernen{nameSuffix}!</div>
            <div className="onb-sub">Lass uns dein Kochbuch einrichten. Das dauert keine Minute.</div>
          </div>
        </div>
      );
      footer = (
        <>
          <button type="button" className="onb-cta" disabled={!trimmedName && !greeted} onClick={greeted ? next : greet}>Weiter</button>
          {skip}
        </>
      );
      break;
    case 'sources':
      body = (
        <>
          <div className="onb-q">Wo speicherst du deine Rezepte{nameSuffix}?</div>
          <div className="onb-sub" style={{ marginTop: -8 }}>Wähle alles, was passt.</div>
          <div className="onb-tiles">
            {SOURCES.map((s) => (
              <button key={s.id} type="button" className="onb-tile" aria-pressed={sources.includes(s.id)} onClick={() => toggle(setSources, s.id)}>
                <span className="onb-brand" style={{ background: s.bg }}>{s.icon}</span>
                <span>{s.label}</span>
                <span className="onb-chk" />
              </button>
            ))}
          </div>
        </>
      );
      footer = <><button type="button" className="onb-cta" disabled={!sources.length} onClick={next}>Weiter</button>{skip}</>;
      break;
    case 'demo':
      body = <ImportDemo />;
      footer = <><button type="button" className="onb-cta" onClick={next}>Weiter</button>{skip}</>;
      break;
    case 'goals':
      body = (
        <>
          <div className="onb-q" style={{ fontSize: 25 }}>Was suchst du in Cookly?</div>
          <div className="onb-sub" style={{ marginTop: -8 }}>Wähle alles, was passt.</div>
          <div className="onb-opts">
            {GOALS.map((g) => (
              <button key={g.id} type="button" className="onb-opt" aria-pressed={goals.includes(g.id)} onClick={() => toggle(setGoals, g.id)}>
                <span className="onb-ico">{g.icon}</span>
                <span>{g.label}</span>
                <span className="onb-chk" />
              </button>
            ))}
          </div>
        </>
      );
      footer = <><button type="button" className="onb-cta" disabled={!goals.length} onClick={next}>Weiter</button>{skip}</>;
      break;
    case 'referral':
      body = (
        <>
          <div className="onb-q" style={{ fontSize: 25 }}>Wie hast du von Cookly erfahren?</div>
          <div className="onb-sub" style={{ marginTop: -8 }}>Das hilft uns sehr.</div>
          <div className="onb-tiles">
            {REFERRALS.map((r) => (
              <button key={r.id} type="button" className="onb-tile" aria-pressed={referral === r.id} onClick={() => pickReferral(r.id)}>
                <span className="onb-brand" style={{ background: r.bg }}>{r.icon}</span>
                <span>{r.label}</span>
                <span className="onb-chk" />
              </button>
            ))}
          </div>
        </>
      );
      footer = <><button type="button" className="onb-cta" disabled={!referral} onClick={next}>Weiter</button>{skip}</>;
      break;
    case 'setup':
      // Kein Ladekreis: Er wirkte auf Nutzer, als würde etwas installiert.
      body = (
        <div className="onb-ready">
          <Ill src={ONB_IMG.setup} h={150} />
          <div className="onb-q" style={{ fontSize: 25 }}>Super{nameSuffix}!<br />Cookly ist personalisiert und bereit.</div>
          <div className="onb-why">
            <div><span className="onb-ico"><BookOpen size={16} /></span>Kochbücher anlegen</div>
            <div><span className="onb-ico"><Globe size={16} /></span>Rezepte aus Social Media & Web importieren</div>
            <div><span className="onb-ico"><Camera size={16} /></span>Dein Lieblingskochbuch per Foto digitalisieren</div>
          </div>
        </div>
      );
      footer = <button type="button" className="onb-cta" onClick={next}>Weiter</button>;
      break;
    case 'account':
      body = (
        <>
          <Ill src={ONB_IMG.account} h={170} />
          <div className="onb-q">Erstelle dein kostenloses Konto</div>
          <div className="onb-free">
            <div className="hd">Kostenlos inklusive</div>
            <ul>
              <li><Check size={14} strokeWidth={3} className="onb-tick" /><span><b>{FREE_LIMITS.LINK_IMPORTS}</b> Importe aus Social Media & Web</span></li>
              <li><Check size={14} strokeWidth={3} className="onb-tick" /><span><b>{FREE_LIMITS.PHOTO_SCANS}</b> Rezepte per Foto</span></li>
              <li><Check size={14} strokeWidth={3} className="onb-tick" /><span><b>Unbegrenzt</b> eigene Rezepte anlegen</span></li>
            </ul>
          </div>
          {authError && <div className="onb-err">{authError}</div>}
        </>
      );
      footer = (
        <>
          <div className="onb-apple"><AppleSignInButton label="Mit Apple fortfahren" onError={setAuthError} /></div>
          <button type="button" className="onb-signin google" onClick={google} disabled={busy}>{GOOGLE_G}Mit Google fortfahren</button>
          <button type="button" className="onb-signin mail" onClick={() => navigate('/sign-up')}><Mail size={18} />Mit E-Mail fortfahren</button>
        </>
      );
      break;
    case 'push':
      body = (
        <>
          <Ill src={ONB_IMG.bell} h={170} />
          <div className="onb-q">Sollen wir dir Bescheid geben?</div>
          <div className="onb-why">
            <div><span className="onb-ico"><Check size={16} strokeWidth={2.4} /></span>Rezept importiert</div>
            <div><span className="onb-ico"><Calendar size={16} /></span>Wochenplan steht an</div>
          </div>
          <div className="onb-sub" style={{ fontSize: 13 }}>Jederzeit abschaltbar.</div>
        </>
      );
      footer = (
        <>
          <button type="button" className="onb-cta" onClick={activatePush} disabled={busy}>Aktivieren</button>
          <button type="button" className="onb-ghost" onClick={next} disabled={busy}>Später</button>
        </>
      );
      break;
  }

  const flush = step === 'start';

  return (
    <div className={`onb${flush ? ' flush' : ''}`}>
      <div className="onb-col">
        {!flush && (
          <div className="onb-hd">
            {index > 0 && (
              <button type="button" className="onb-round" onClick={back} aria-label="Zurück">
                <ChevronLeft size={20} strokeWidth={2.4} />
              </button>
            )}
            <div className="onb-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <div key={step} className={`onb-bd${flush ? ' flush' : ''}`}>{body}</div>
        <div className="onb-ft">{footer}</div>
      </div>
    </div>
  );
};
