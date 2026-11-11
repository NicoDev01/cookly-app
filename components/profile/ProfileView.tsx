import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { AlertTriangle, Link2, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FREE_LIMITS } from '../../convex/constants';
import { APP_VERSION } from '../../utils/appInfo';
import { LEGAL_LINKS } from '../../utils/legalLinks';
import { showsExternalPaymentBranding } from '../../utils/paymentBranding';
import DebugSheet from '../DebugSheet';
import ExternalLink from '../ExternalLink';
import { ONB_IMG } from '../onboarding/onboardingData';
import { LiquidMetalBorder } from '../ui/liquid-metal-border';
import { PEARL_BORDER } from '../ui/pearlBorder';

const SUPPORT_MAIL = 'aimpact.agency@gmail.com';

/** Die Felder aus users.getCurrentUser, die das Profil braucht. */
export type ProfileUser = {
  _id: string;
  name?: string;
  subscription?: 'free' | 'pro_monthly' | 'pro_yearly';
  subscriptionStatus?: 'active' | 'canceled' | 'past_due';
  notificationsEnabled?: boolean;
  usageStats?: {
    linkImports?: number;
    photoScans?: number;
    resetOnDowngrade?: boolean;
    subscriptionEndDate?: number;
  };
};

/** Laufende Pro-Periode aus `billing.getSummary`. */
export type ProRenewal = { plan: 'pro_monthly' | 'pro_yearly'; periodEnd: number | null; willRenew: boolean };

type Props = {
  /** `null`/`undefined` = lädt noch. */
  user: ProfileUser | null | undefined;
  renewal?: ProRenewal | null;
  onUpgrade: () => void;
  /** Öffnet direkt Stripe-Portal bzw. Store-Abo (auch zum Reaktivieren und bei fehlgeschlagener Zahlung). */
  onManageSubscription: () => void;
  /** Web-Abos kündigt man hier, Store-Abos nur im Store. */
  canCancelHere: boolean;
  /** Pro läuft über App Store oder Google Play: Das Abo endet nicht mit dem Konto. */
  storeSubscription?: boolean;
  /** `true`, wenn gekündigt; Fehler meldet die Seite selbst. */
  onCancelSubscription: () => Promise<boolean>;
  onSignOut: () => void;
  /** Wird beim Öffnen des Lösch-Dialogs aufgerufen (neue Anfrage-ID). */
  onDeleteDialogOpen: () => void;
  /** `true`, wenn gelöscht; Fehler meldet die Seite selbst. */
  onDeleteAccount: () => Promise<boolean>;
  onToggleNotifications: () => Promise<void>;
};

const cardClass = 'block w-full bg-card-light dark:bg-card-dark rounded-xl shadow-neo-light-convex p-4 text-left';
const softButton =
  'flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all touch-btn text-body font-semibold';
const sheetPanel =
  'w-full max-w-md bg-card-light dark:bg-card-dark rounded-t-[2rem] p-6 pb-safe animate-in slide-in-from-bottom duration-400 shadow-neo-light-convex dark:shadow-neo-dark-convex';
const sheetSecondary =
  'w-full h-14 text-lg font-bold rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all text-text-primary-light dark:text-text-primary-dark';

/**
 * Profil-Tab ohne Datenzugriff: pages/ProfilePage liefert Convex-Daten und Aktionen, das Labor (lab/profile) Testdaten.
 * Kontingente kommen direkt aus dem Nutzer-Dokument (keine eigenen Limit-Abfragen).
 */
const ProfileView: React.FC<Props> = ({
  user,
  renewal,
  onUpgrade,
  onManageSubscription,
  canCancelHere,
  storeSubscription = false,
  onCancelSubscription,
  onSignOut,
  onDeleteDialogOpen,
  onDeleteAccount,
  onToggleNotifications,
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);

  // Verstecktes Debug-Menü: 7× auf die Versionsnummer tippen.
  const debugTapsRef = useRef(0);
  const [showDebugSheet, setShowDebugSheet] = useState(false);
  const handleVersionTap = () => {
    debugTapsRef.current += 1;
    if (debugTapsRef.current >= 7) {
      debugTapsRef.current = 0;
      setShowDebugSheet(true);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const firstName = user.name?.trim().split(/\s+/)[0];
  const isPro = (user.subscription ?? 'free') !== 'free';
  const isMarkedForCancel = (user.usageStats?.resetOnDowngrade ?? false) || renewal?.willRenew === false;
  const paymentFailed = user.subscriptionStatus === 'past_due';
  const endMs = renewal?.periodEnd ?? user.usageStats?.subscriptionEndDate;
  const subscriptionEndDate = endMs ? new Date(endMs) : null;
  const planLabel = (renewal?.plan ?? user.subscription) === 'pro_yearly' ? 'Jahresabo' : 'Monatsabo';
  const endLabel = subscriptionEndDate?.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  // Gerade laufende Importe zählen erst mit, wenn sie fertig sind; dafür entfallen zwei Abfragen.
  const linkUsage = { current: user.usageStats?.linkImports ?? 0, limit: FREE_LIMITS.LINK_IMPORTS };
  const scanUsage = { current: user.usageStats?.photoScans ?? 0, limit: FREE_LIMITS.PHOTO_SCANS };
  // Konto-ID, Version und Plattform vorausgefüllt, damit Support-Mails sofort zuzuordnen sind.
  const supportHref = `mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent(`Cookly ${APP_VERSION}`)}&body=${encodeURIComponent(
    `\n\n---\nKonto-ID: ${user._id}\nVersion: ${APP_VERSION} (${Capacitor.getPlatform()})`,
  )}`;

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      if (await onCancelSubscription()) setShowCancelModal(false);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== 'LÖSCHEN') return;
    setIsDeleting(true);
    try {
      if (await onDeleteAccount()) setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNotificationToggle = async () => {
    setIsUpdatingNotifications(true);
    try {
      await onToggleNotifications();
    } finally {
      setIsUpdatingNotifications(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted text-foreground font-sans pt-safe pb-safe select-none">
      <div className="container mx-auto px-4 py-6 max-w-xl">
        <div className="flex flex-col items-center mb-10 animate-in fade-in">
          <img src={ONB_IMG.hello} alt="" className="h-24 w-auto mb-4" />
          {firstName && <p className="mb-1 text-xl font-semibold text-text-secondary-light dark:text-text-secondary-dark">Hallo {firstName}</p>}
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">
            Dein Status: <span className="text-primary italic">{isPro ? 'Pro' : 'Free'}</span>
          </h1>
        </div>

        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
            {isPro ? (
              <div className="space-y-4">
                {/* Abo-Stand; bei fehlgeschlagener Zahlung rot, damit niemand Pro unbemerkt verliert */}
                <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-neo-light-convex dark:shadow-neo-dark-convex p-4 text-center">
                  {paymentFailed ? (
                    <>
                      <p className="font-semibold text-destructive">Zahlung fehlgeschlagen</p>
                      <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">Aktualisiere deine Zahlungsart, damit Pro aktiv bleibt.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{planLabel}</p>
                      <p className="mt-1 font-medium text-text-primary-light dark:text-text-primary-dark">
                        {!endLabel ? 'Pro ist aktiv' : isMarkedForCancel ? `Gekündigt, aktiv bis ${endLabel}` : `Verlängert sich am ${endLabel}`}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">Unbegrenzte Importe und Rezept-Scans</p>
                    </>
                  )}
                </div>

                <div className="pt-4 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={onManageSubscription}
                    className={cn(softButton, paymentFailed ? 'text-destructive' : 'text-text-primary-light dark:text-text-primary-dark hover:text-primary')}
                  >
                    <span className="material-symbols-outlined">{paymentFailed ? 'payments' : 'settings'}</span>
                    {paymentFailed ? 'Zahlungsart aktualisieren' : isMarkedForCancel ? 'Abo wieder aktivieren' : 'Abo verwalten'}
                  </button>
                  {canCancelHere && !isMarkedForCancel && !paymentFailed && (
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(true)}
                      className="text-xs font-bold text-text-secondary-light dark:text-text-secondary-dark active:text-destructive transition-colors uppercase tracking-widest py-2"
                    >
                      Abo kündigen
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Eine volle Karte führt direkt zum Upgrade */}
                <UsageCard full={linkUsage.current >= linkUsage.limit} onUpgrade={onUpgrade}>
                  <UsageRow label="Importe" hint="Instagram, TikTok, Facebook und Websites" current={linkUsage.current} limit={linkUsage.limit} icon={Link2} />
                </UsageCard>
                <UsageCard full={scanUsage.current >= scanUsage.limit} onUpgrade={onUpgrade}>
                  <UsageRow label="Rezept-Scans" hint="Kochbuchseiten, Rezeptkarten und Fotos" current={scanUsage.current} limit={scanUsage.limit} icon={Sparkles} />
                </UsageCard>

                <div className="space-y-8 flex flex-col items-center pt-8">
                  <p className="text-4xl md:text-5xl font-bold tracking-tight text-center">
                    Werde zum unlimitierten
                    <br />
                    <span className="text-primary italic">Pro</span> fikoch
                  </p>
                  <LiquidMetalBorder className="shadow-lg shadow-black/15" {...PEARL_BORDER}>
                    <button
                      type="button"
                      onClick={onUpgrade}
                      className="flex items-center justify-center gap-2 px-7 py-3 rounded-full bg-primary text-white font-semibold hover:bg-primary-dark transition-all touch-btn"
                    >
                      <span className="material-symbols-outlined">auto_awesome</span>
                      Jetzt upgraden
                    </button>
                  </LiquidMetalBorder>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
            <button type="button" onClick={onSignOut} className={cn(softButton, 'w-64 text-text-primary-light dark:text-text-primary-dark hover:text-primary')}>
              <span className="material-symbols-outlined">logout</span>
              Abmelden
            </button>

            <button
              type="button"
              onClick={() => {
                onDeleteDialogOpen();
                setDeleteConfirmText('');
                setShowDeleteModal(true);
              }}
              className={cn(softButton, 'w-64 text-destructive hover:text-destructive/80')}
            >
              <span className="material-symbols-outlined">delete_forever</span>
              Konto löschen
            </button>

            {/* Nur Icon und Schalter: Die Glocke erklärt sich selbst. */}
            <button
              type="button"
              role="switch"
              aria-label="Mitteilungen"
              aria-checked={user.notificationsEnabled === true}
              disabled={isUpdatingNotifications}
              onClick={handleNotificationToggle}
              className="min-h-12 flex items-center justify-center gap-4 px-2 py-2 bg-transparent touch-manipulation text-text-primary-light dark:text-text-primary-dark disabled:opacity-60"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {user.notificationsEnabled ? 'notifications_active' : 'notifications_off'}
              </span>
              <span aria-hidden="true" className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', user.notificationsEnabled ? 'bg-primary' : 'bg-black/20 dark:bg-white/20')}>
                <span className={cn('absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform', user.notificationsEnabled && 'translate-x-5')} />
              </span>
            </button>
          </div>

          <div className="pt-8 pb-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400">
            {/* mailto: nicht über ExternalLink, das öffnet nativ den In-App-Browser. */}
            <a href={supportHref} className="text-xs font-bold text-primary active:underline underline-offset-4">
              Support kontaktieren
            </a>
            <p className="mt-3 text-xs text-text-secondary-light dark:text-text-secondary-dark">
              <ExternalLink href={LEGAL_LINKS.privacy} className="active:underline">Datenschutz</ExternalLink>
              <span aria-hidden="true"> · </span>
              <ExternalLink href={LEGAL_LINKS.terms} className="active:underline">Nutzungsbedingungen</ExternalLink>
              <span aria-hidden="true"> · </span>
              <ExternalLink href={LEGAL_LINKS.impressum} className="active:underline">Impressum</ExternalLink>
            </p>
            <p onClick={handleVersionTap} className="mt-3 text-[11px] text-text-secondary-light/60 dark:text-text-secondary-dark/60 select-none cursor-default">
              Version {APP_VERSION}
            </p>
          </div>
        </div>
      </div>

      {showCancelModal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className={sheetPanel}>
            <div className="w-12 h-1.5 bg-text-secondary-light/30 dark:bg-text-secondary-dark/30 rounded-full mx-auto mb-6" />
            <div className="bg-destructive/10 p-4 rounded-xl w-fit mb-6 mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold mb-3 text-center text-text-primary-light dark:text-text-primary-dark">Abo wirklich kündigen?</h2>
            <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark mb-8 leading-relaxed text-center">
              Deine Vorteile bleiben bis zum <strong className="text-text-primary-light dark:text-text-primary-dark">{subscriptionEndDate?.toLocaleDateString('de-DE')}</strong> aktiv.
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="w-full h-14 text-lg font-bold rounded-xl bg-destructive text-white shadow-neo-light-convex active:scale-[0.98] transition-all"
                onClick={handleCancel}
                disabled={isCancelling}
              >
                {isCancelling ? 'Kündigt...' : 'Ja, Abo kündigen'}
              </button>
              <button type="button" className={sheetSecondary} onClick={() => setShowCancelModal(false)}>
                Behalten
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Per Portal am Body und zentriert über der Tastatur: Im Tab-Container verrutschte `fixed` samt Eingabefeld aus dem Bild. */}
      {showDeleteModal && createPortal(
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="kb-pad flex h-full items-center justify-center overflow-y-auto overscroll-none">
          <div className="my-auto w-full max-w-sm px-4 py-4">
          <div className="w-full rounded-[2rem] bg-card-light p-6 shadow-2xl animate-in zoom-in-95 fade-in duration-200 dark:bg-card-dark">
            <h2 className="mb-2 text-center text-2xl font-bold text-destructive">Konto löschen?</h2>
            <p className="mb-5 text-center text-sm leading-relaxed text-text-secondary-light dark:text-text-secondary-dark">
              Dein Konto und alle Rezepte werden unwiderruflich gelöscht.
              {isPro && !storeSubscription && showsExternalPaymentBranding && ' Dein Pro-Abo endet sofort.'}
            </p>
            {isPro && storeSubscription && (
              <div className="mb-5 rounded-2xl bg-amber-500/10 p-4 text-sm leading-relaxed text-text-primary-light dark:text-text-primary-dark">
                <p>
                  Dein Pro-Abo wird weiter über {Capacitor.getPlatform() === 'ios' ? 'App Store' : 'Google Play'} abgerechnet, auch nach dem Löschen. Kündige es bitte vorher.
                </p>
                <button type="button" onClick={onManageSubscription} className="mt-3 w-full rounded-xl bg-card-light py-2.5 font-semibold text-text-primary-light shadow-neo-light-convex active:scale-[0.98] dark:bg-card-dark dark:text-text-primary-dark">
                  Abo kündigen
                </button>
              </div>
            )}
            <input
              className="mb-5 h-14 w-full rounded-xl border-2 border-transparent bg-muted px-6 text-center text-lg font-bold uppercase tracking-[0.2em] text-text-primary-light outline-none transition-colors placeholder:normal-case placeholder:tracking-normal focus:border-destructive dark:text-text-primary-dark"
              placeholder='Tippe "LÖSCHEN"'
              autoCapitalize="characters"
              autoCorrect="off"
              enterKeyHint="done"
              onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
            />
            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="h-14 w-full rounded-xl bg-destructive text-lg font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
                disabled={isDeleting || deleteConfirmText !== 'LÖSCHEN'}
                onClick={handleDelete}
              >
                {isDeleting ? 'Wird gelöscht...' : 'Endgültig löschen'}
              </button>
              <button type="button" className={sheetSecondary} disabled={isDeleting} onClick={() => setShowDeleteModal(false)}>
                Abbrechen
              </button>
            </div>
          </div>
          </div>
          </div>
        </div>,
        document.body,
      )}

      <DebugSheet isOpen={showDebugSheet} onClose={() => setShowDebugSheet(false)} userId={user._id} />
    </div>
  );
};

/** Kontingent-Karte; ist sie voll, führt ein Tipp direkt zum Upgrade. */
const UsageCard = ({ full, onUpgrade, children }: { full: boolean; onUpgrade: () => void; children: React.ReactNode }) =>
  full ? (
    <button type="button" onClick={onUpgrade} className={cn(cardClass, 'transition-transform active:scale-[0.98]')} aria-label="Kontingent aufgebraucht, jetzt upgraden">
      {children}
    </button>
  ) : (
    <div className={cardClass}>{children}</div>
  );

const UsageRow = ({ icon: Icon, label, hint, current, limit }: { icon: LucideIcon; label: string; hint?: string; current: number; limit: number }) => {
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isFull = percentage >= 100 && limit > 0;

  return (
    <div className="space-y-3 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={cn('w-6 h-6', isFull ? 'text-destructive' : 'text-primary')} />
          <div className="min-w-0">
            <span className="block font-bold text-base text-text-primary-light dark:text-text-primary-dark">{label}</span>
            {hint && <span className="block text-xs text-text-secondary-light dark:text-text-secondary-dark">{hint}</span>}
          </div>
        </div>
        <span className={cn('text-sm font-bold tabular-nums', isFull ? 'text-destructive' : 'text-text-secondary-light dark:text-text-secondary-dark')}>
          {current} / {limit}
        </span>
      </div>
      <div className="h-5 w-full bg-card-light dark:bg-card-dark rounded-xl overflow-hidden">
        <div
          className={cn('h-full rounded-xl transition-all duration-1000 ease-out relative overflow-hidden', isFull ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${percentage}%` }}
        >
          <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] skew-x-12"></div>
        </div>
      </div>
    </div>
  );
};

export default ProfileView;
