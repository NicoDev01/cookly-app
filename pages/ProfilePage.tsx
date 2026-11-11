"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import { getUserErrorMessage } from '../utils/userErrors';
import { clearLogs, logger } from '../utils/logger';
import { createUuid } from '../utils/uuid';
import { useQueryCache } from '../contexts/QueryCacheContext';
import ProfileView from '../components/profile/ProfileView';
import { createBillingClient } from '../services/billing';
import { resetAnalyticsIdentity } from "../services/analytics";
import { ensureNotificationPermission } from "../utils/notifications";
import { forgetAccountOnDevice } from "../components/onboarding/onboardingData";

export const ProfilePage: React.FC = () => {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const { clearCache } = useQueryCache();

  const currentUser = useQuery(api.users.getCurrentUser);
  const isPro = !!currentUser && currentUser.subscription !== 'free';
  // Wo das Abo läuft, braucht nur „Abo verwalten“ im Store; Free-Nutzer abonnieren das nicht.
  const billingSummary = useQuery(api.billing.getSummary, isPro ? {} : 'skip');
  const cancelSubscription = useAction(api.stripe.cancelSubscription);
  const createCheckout = useAction(api.stripe.createCheckoutSession);
  const createPortal = useAction(api.stripe.createPortalSession);
  const ensureBillingUserId = useMutation(api.users.ensureBillingUserId);
  const requestAccountDeletion = useAction(api.accountDeletion.requestDeletion);
  const updateNotificationPreference = useMutation(api.users.updateNotificationPreference);
  const deletionRequestIdRef = useRef<string | null>(null);

  const billing = useMemo(() => createBillingClient(currentUser?.billingUserId, {
    checkout: createCheckout,
    portal: createPortal,
  }), [currentUser?.billingUserId, createCheckout, createPortal]);

  // Store-Abo verwalten braucht die Billing-ID (wie auf der Upgrade-Seite).
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isPro || !currentUser || currentUser.billingUserId) return;
    void ensureBillingUserId();
  }, [currentUser, isPro, ensureBillingUserId]);

  // Rückkehr aus dem Stripe-Checkout: bestätigen, auch wenn der Webhook Pro erst Sekunden später setzt.
  const { search } = useLocation();
  useEffect(() => {
    if (new URLSearchParams(search).get('success') !== 'true') return;
    showToast('Danke! Pro wird gerade freigeschaltet.', 'success');
    navigate('/tabs/profile', { replace: true });
  }, [search, showToast, navigate]);

  const subscriptionEndDate = currentUser?.usageStats?.subscriptionEndDate
    ? new Date(currentUser.usageStats.subscriptionEndDate)
    : null;

  const handleSignOut = async () => {
    resetAnalyticsIdentity();
    await signOut();
    navigate('/sign-in', { replace: true });
  };

  const handleManageSubscription = async () => {
    if (!billing.available) {
      showToast('In-App-Kauf ist in dieser App-Version noch nicht verfügbar.');
      return;
    }
    if (billing.provider === 'store' && !billingSummary?.providers.some((provider: string) => provider === 'google_play' || provider === 'app_store')) {
      showToast('Dieses Abo wurde im Web abgeschlossen und kann dort verwaltet werden.');
      return;
    }
    try {
      const redirectUrl = await billing.manage();
      if (redirectUrl) window.location.href = redirectUrl;
    } catch (error: unknown) {
      logger.error('Billing', 'Portal failed', error);
      showToast(getUserErrorMessage(error, 'billing'), 'error');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      deletionRequestIdRef.current ??= createUuid();
      await requestAccountDeletion({ requestId: deletionRequestIdRef.current });
      clearCache();
      clearLogs();
      resetAnalyticsIdentity();
      forgetAccountOnDevice();
      await signOut();
      navigate('/welcome', { replace: true });
      return true;
    } catch (error: unknown) {
      logger.error('AccountDeletion', 'Delete account failed', error);
      showToast(getUserErrorMessage(error, 'generic'), 'error');
      return false;
    }
  };

  const handleCancelSubscription = async () => {
    try {
      await cancelSubscription();
      const until = subscriptionEndDate
        ? ` Deine Vorteile bleiben bis zum ${subscriptionEndDate.toLocaleDateString('de-DE')} aktiv.`
        : '';
      showToast(`Abo gekündigt.${until}`, 'success');
      return true;
    } catch (error: unknown) {
      logger.error('Billing', 'Cancel subscription failed', error);
      showToast(getUserErrorMessage(error, 'billing'), 'error');
      return false;
    }
  };

  const handleNotificationToggle = async () => {
    const enabled = !currentUser?.notificationsEnabled;
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
    }
  };

  return (
    <ProfileView
      user={currentUser}
      onUpgrade={() => navigate('/tabs/subscribe')}
      onManageSubscription={() => void handleManageSubscription()}
      canCancelHere={!Capacitor.isNativePlatform()}
      storeSubscription={!!billingSummary?.providers.some((provider) => provider === 'app_store' || provider === 'google_play')}
      onCancelSubscription={handleCancelSubscription}
      onSignOut={() => void handleSignOut()}
      onDeleteDialogOpen={() => {
        deletionRequestIdRef.current = null;
      }}
      onDeleteAccount={handleDeleteAccount}
      onToggleNotifications={handleNotificationToggle}
    />
  );
};

export default ProfilePage;
