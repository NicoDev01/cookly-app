"use client";

import React, { useState, useRef } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import {
  AlertTriangle,
  Link2,
  Sparkles,
  CheckCircle2,
  LucideIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import { getUserErrorMessage } from '../utils/userErrors';
import { clearLogs, logger } from '../utils/logger';
import { APP_VERSION } from '../utils/appInfo';
import { createUuid } from '../utils/uuid';
import DebugSheet from '../components/DebugSheet';
import ExternalLink from '../components/ExternalLink';
import { useQueryCache } from '../contexts/QueryCacheContext';
import { showsExternalPaymentBranding } from '../utils/paymentBranding';
import { LEGAL_LINKS } from '../utils/legalLinks';

import { cn } from "@/lib/utils";
import { resetAnalyticsIdentity } from "../services/analytics";
import { ensureNotificationPermission } from "../utils/notifications";

export const ProfilePage: React.FC = () => {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const { clearCache } = useQueryCache();

  const currentUser = useQuery(api.users.getCurrentUser);
  const cancelSubscription = useAction(api.stripe.cancelSubscription);
  const requestAccountDeletion = useAction(api.accountDeletion.requestDeletion);
  const updateNotificationPreference = useMutation(api.users.updateNotificationPreference);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);

  // Verstecktes Debug-Menü: 7× auf die Versionsnummer tippen.
  const debugTapsRef = useRef(0);
  const deletionRequestIdRef = useRef<string | null>(null);
  const [showDebugSheet, setShowDebugSheet] = useState(false);
  const handleVersionTap = () => {
    debugTapsRef.current += 1;
    if (debugTapsRef.current >= 7) {
      debugTapsRef.current = 0;
      setShowDebugSheet(true);
    }
  };

  // Usage Stats
  const linkLimit = useQuery(api.users.canImportFromLink);
  const scanLimit = useQuery(api.users.canScanPhoto);

  const handleSignOut = async () => {
    resetAnalyticsIdentity();
    await signOut();
    navigate('/sign-in', { replace: true });
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'LÖSCHEN') return;
    setIsDeleting(true);
    try {
      deletionRequestIdRef.current ??= createUuid();
      await requestAccountDeletion({ requestId: deletionRequestIdRef.current });
      clearCache();
      clearLogs();
      resetAnalyticsIdentity();
      await signOut();
      navigate('/sign-in', { replace: true });
      setShowDeleteModal(false);
    } catch (error: unknown) {
      logger.error('AccountDeletion', 'Delete account failed', error);
      showToast(getUserErrorMessage(error, 'generic'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    try {
      await cancelSubscription();
      setShowCancelModal(false);
      const until = subscriptionEndDate
        ? ` Deine Vorteile bleiben bis zum ${subscriptionEndDate.toLocaleDateString('de-DE')} aktiv.`
        : '';
      showToast(`Abo gekündigt.${until}`, 'success');
    } catch (error: unknown) {
      logger.error('Billing', 'Cancel subscription failed', error);
      showToast(getUserErrorMessage(error, 'billing'), 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleNotificationToggle = async () => {
    const enabled = !currentUser?.notificationsEnabled;
    setIsUpdatingNotifications(true);
    try {
      if (enabled && !await ensureNotificationPermission('profile')) {
        showToast('Bitte erlaube Benachrichtigungen in den Android-Einstellungen.', 'error');
        return;
      }
      await updateNotificationPreference({ enabled });
      if (enabled) {
        window.dispatchEvent(new Event('cookly:notification-permission-granted'));
      }
      showToast(
        enabled ? 'Benachrichtigungen aktiviert.' : 'Benachrichtigungen deaktiviert.',
        'success',
      );
    } catch (error: unknown) {
      logger.error('Notifications', 'Preference update failed', error);
      showToast(getUserErrorMessage(error, 'generic'), 'error');
    } finally {
      setIsUpdatingNotifications(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const safeCurrentUser = currentUser ?? {
    subscription: 'free' as const,
    usageStats: { linkImports: 0, photoScans: 0 },
  };

  const isPro = safeCurrentUser.subscription !== 'free';
  const isMarkedForCancel = currentUser?.usageStats?.resetOnDowngrade || false;
  const subscriptionEndDate = currentUser?.usageStats?.subscriptionEndDate
    ? new Date(currentUser.usageStats.subscriptionEndDate)
    : null;

  return (
    <div className="min-h-screen bg-muted text-foreground font-sans pt-safe pb-safe select-none">
      <div className="container mx-auto px-4 py-6 max-w-xl">
        {/* Hero Section - above the Card */}
        <div className="flex flex-col items-center mb-10 animate-in fade-in">
          {/* Icon */}
          <span className="material-symbols-outlined text-8xl text-primary animate-pulse mb-4">
            person
          </span>

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">
            Dein Status: <span className="text-primary italic">{isPro ? "Pro" : "Free"}</span>
          </h1>
        </div>

        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          {/* Main Membership & Stats */}
          <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
            {isPro ? (
              // PRO CONTENT - Features in separate cards
              <div className="space-y-4">
                {/* Feature Cards */}
                <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-neo-light-convex dark:shadow-neo-dark-convex p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="font-medium text-text-primary-light dark:text-text-primary-dark">Unbegrenzte Rezepte & Importe</span>
                  </div>
                </div>
                <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-neo-light-convex dark:shadow-neo-dark-convex p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="font-medium text-text-primary-light dark:text-text-primary-dark">KI-Funktionen freigeschaltet</span>
                  </div>
                </div>
                <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-neo-light-convex dark:shadow-neo-dark-convex p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="font-medium text-text-primary-light dark:text-text-primary-dark">Jederzeit kündbar</span>
                  </div>
                </div>

                {/* Pro Action Buttons */}
                <div className="pt-4 flex flex-col items-center gap-3">
                  <button
                    onClick={() => navigate('/tabs/subscribe')}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all touch-btn text-body font-semibold text-text-primary-light dark:text-text-primary-dark hover:text-primary"
                  >
                    <span className="material-symbols-outlined">settings</span>
                    Abo verwalten
                  </button>
                  {!Capacitor.isNativePlatform() && !isMarkedForCancel && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="text-xs font-bold text-text-secondary-light dark:text-text-secondary-dark active:text-destructive transition-colors uppercase tracking-widest py-2"
                    >
                      Abo kündigen
                    </button>
                  )}
                </div>
              </div>
            ) : (
              // FREE CONTENT - Each UsageRow in its own card
              <div className="space-y-4">
                {/* Usage Cards - each in its own card */}
                <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-neo-light-convex p-4">
                  <UsageRow
                    label="IG / FB / Website Importe"
                    current={linkLimit?.current ?? 0}
                    limit={linkLimit?.limit ?? 0} // Sync with backend
                    icon={Link2}
                  />
                </div>
                <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-neo-light-convex p-4">
                  <UsageRow
                    label="KI Foto-Scan"
                    current={scanLimit?.current ?? 0}
                    limit={scanLimit?.limit ?? 0} // Sync with backend
                    icon={Sparkles}

                  />
                </div>

                {/* Upgrade Button */}
                <div className="space-y-8 flex flex-col items-center pt-8">
                  <p className="text-4xl md:text-5xl font-bold tracking-tight text-center">
                    Werde zum unlimitierten<br/>
                    <span className="text-primary italic">Pro</span> fikoch
                  </p>
                  <button
                    onClick={() => navigate('/tabs/subscribe')}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow-neo-light-convex hover:bg-primary-dark transition-all touch-btn"
                  >
                    <span className="material-symbols-outlined">auto_awesome</span>
                    Jetzt upgraden
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col items-center gap-3 max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
            <button
              onClick={handleSignOut}
              className="w-64 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all touch-btn text-body font-semibold text-text-primary-light dark:text-text-primary-dark hover:text-primary"
            >
              <span className="material-symbols-outlined">logout</span>
              Abmelden
            </button>

            <button
              onClick={() => {
                deletionRequestIdRef.current = null;
                setDeleteConfirmText('');
                setShowDeleteModal(true);
              }}
              className="w-64 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all touch-btn text-body font-semibold text-destructive hover:text-destructive/80"
            >
              <span className="material-symbols-outlined">delete_forever</span>
              Konto löschen
            </button>

            <button
              type="button"
              role="switch"
              aria-label="Benachrichtigungen ein- oder ausschalten"
              aria-checked={currentUser.notificationsEnabled === true}
              disabled={isUpdatingNotifications}
              onClick={handleNotificationToggle}
              className="min-h-12 flex items-center justify-center gap-4 px-2 py-2 bg-transparent touch-manipulation text-text-primary-light dark:text-text-primary-dark disabled:opacity-60"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {currentUser.notificationsEnabled ? "notifications_active" : "notifications_off"}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  currentUser.notificationsEnabled ? "bg-primary" : "bg-black/20 dark:bg-white/20",
                )}
              >
                <span
                  className={cn(
                    "absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
                    currentUser.notificationsEnabled && "translate-x-5",
                  )}
                />
              </span>
            </button>
          </div>

          {/* Footer Info */}
          <div className="pt-8 pb-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400">
             <ExternalLink
               href={LEGAL_LINKS.impressum}
               className="text-xs font-bold text-primary active:underline underline-offset-4"
             >
               Datenschutz & Impressum
             </ExternalLink>
             <p
               onClick={handleVersionTap}
               className="mt-3 text-[11px] text-text-secondary-light/60 dark:text-text-secondary-dark/60 select-none cursor-default"
             >
               Version {APP_VERSION}
             </p>
          </div>
        </div>
      </div>

      {/* Cancel Modal - Bottom Sheet Style */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-card-light dark:bg-card-dark rounded-t-[2rem] p-6 pb-safe animate-in slide-in-from-bottom duration-400 shadow-neo-light-convex dark:shadow-neo-dark-convex">
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
                className="w-full h-14 text-lg font-bold rounded-xl bg-destructive text-white shadow-neo-light-convex active:scale-[0.98] transition-all"
                onClick={handleCancelSubscription}
                disabled={isCancelling}
              >
                {isCancelling ? "Kündigt..." : "Ja, Abo kündigen"}
              </button>
              <button
                className="w-full h-14 text-lg font-bold rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all text-text-primary-light dark:text-text-primary-dark"
                onClick={() => setShowCancelModal(false)}
              >
                Behalten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal - Bottom Sheet Style */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-card-light dark:bg-card-dark rounded-t-[2rem] p-6 pb-safe animate-in slide-in-from-bottom duration-400 shadow-neo-light-convex dark:shadow-neo-dark-convex">
            <div className="w-12 h-1.5 bg-text-secondary-light/30 dark:bg-text-secondary-dark/30 rounded-full mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-3 text-destructive text-center">Konto löschen?</h2>
            <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark mb-6 leading-relaxed text-center">
              {showsExternalPaymentBranding
                ? "Diese Aktion ist unwiderruflich. Konto und Rezepte werden gelöscht; ein Stripe-Abo endet sofort."
                : "Diese Aktion ist unwiderruflich. Konto und Rezepte werden gelöscht; ein laufendes Abo endet sofort."}
              Abos über Google Play oder den App Store musst du zusätzlich dort verwalten.
            </p>
            <div className="relative mb-8">
                <input
                  className="w-full h-14 bg-card-light dark:bg-card-dark rounded-xl px-6 font-bold border-2 border-transparent focus:border-destructive transition-all outline-none text-center tracking-[0.2em] text-lg uppercase placeholder:normal-case shadow-neo-light-concave dark:shadow-neo-dark-concave text-text-primary-light dark:text-text-primary-dark"
                  placeholder='Tippe "LÖSCHEN"'
                  onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                />
            </div>
            <div className="flex flex-col gap-3">
              <button
                className="w-full h-14 text-lg font-bold rounded-xl bg-destructive text-white shadow-neo-light-convex active:scale-[0.98] transition-all disabled:opacity-50"
                disabled={isDeleting || deleteConfirmText !== 'LÖSCHEN'}
                onClick={handleDeleteAccount}
              >
                {isDeleting ? "Wird gelöscht..." : "Endgültig löschen"}
              </button>
              <button
                className="w-full h-14 text-lg font-bold rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave transition-all text-text-primary-light dark:text-text-primary-dark"
                disabled={isDeleting}
                onClick={() => {
                  deletionRequestIdRef.current = null;
                  setShowDeleteModal(false);
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      <DebugSheet
        isOpen={showDebugSheet}
        onClose={() => setShowDebugSheet(false)}
        userId={currentUser?._id}
      />
    </div>
  );
};

// --- Sub-components (Styled) ---

const UsageRow = ({ icon: Icon, label, current, limit }: { icon: LucideIcon, label: string, current: number, limit: number }) => {
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isFull = percentage >= 100 && limit > 0;

  return (
    <div className="space-y-3 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={cn(
            "w-6 h-6",
            isFull ? "text-destructive" : "text-primary"
          )} />
          <span className="font-bold text-base text-text-primary-light dark:text-text-primary-dark">{label}</span>
        </div>
        <span className={cn(
            "text-sm font-bold tabular-nums",
            isFull ? "text-destructive" : "text-text-secondary-light dark:text-text-secondary-dark"
        )}>
          {current} / {limit}
        </span>
      </div>
      <div className="h-5 w-full bg-card-light dark:bg-card-dark rounded-xl overflow-hidden">
        <div
          className={cn(
            "h-full rounded-xl transition-all duration-1000 ease-out relative overflow-hidden",
            isFull ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${percentage}%` }}
        >
             <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] skew-x-12"></div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
