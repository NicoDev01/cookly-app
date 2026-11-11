import React, { useEffect, useMemo, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { Capacitor } from '@capacitor/core';
import { Check } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { createBillingClient, type PlanId } from '../../services/billing';
import { capture } from '../../services/analytics';
import { logger } from '../../utils/logger';
import { getUserErrorMessage } from '../../utils/userErrors';
import { LEGAL_LINKS } from '../../utils/legalLinks';
import ExternalLink from '../ExternalLink';
import { ONB_IMG, PRO_FEATURES } from './onboardingData';
import ProUnlocked from '../subscribe/ProUnlocked';

type Prices = { monthly: string; yearly: string; yearlyPerMonth: string | null; savingsPercent: number | null };

const euro = (cents: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const FALLBACK: Prices = { monthly: '2,99 €', yearly: '24,99 €', yearlyPerMonth: '2,08 €', savingsPercent: 30 };

type Props = {
  /** Kostenlos weiter, Schließen oder nach erfolgreichem Kauf. */
  onDone: (result: 'free' | 'purchased') => Promise<void>;
};

export const OnboardingPaywall: React.FC<Props> = ({ onDone }) => {
  const currentUser = useQuery(api.users.getCurrentUser);
  const pricing = useQuery(api.stripe.getPlanPricing);
  const createCheckout = useAction(api.stripe.createCheckoutSession);
  const createPortal = useAction(api.stripe.createPortalSession);
  const ensureBillingUserId = useMutation(api.users.ensureBillingUserId);
  const [plan, setPlan] = useState<PlanId>('pro_yearly');
  const [storePrices, setStorePrices] = useState<Prices | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const billingUserId = currentUser?.billingUserId;
  const billing = useMemo(
    () => createBillingClient(billingUserId, { checkout: createCheckout, portal: createPortal }),
    [billingUserId, createCheckout, createPortal],
  );

  useEffect(() => { capture('paywall_viewed', { placement: 'onboarding' }); }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform() && currentUser && !currentUser.billingUserId) void ensureBillingUserId();
  }, [currentUser, ensureBillingUserId]);

  useEffect(() => {
    if (billing.provider !== 'store' || !billing.available || !billingUserId) return;
    billing.prices()
      .then((p) => p && setStorePrices({
        monthly: p.pro_monthly, yearly: p.pro_yearly,
        yearlyPerMonth: p.yearlyPerMonth, savingsPercent: p.yearlySavingsPercent,
      }))
      .catch((error) => logger.warn('Billing', 'Onboarding prices failed', error));
  }, [billing, billingUserId]);

  const prices: Prices = storePrices ?? (billing.provider === 'stripe' && pricing ? {
    monthly: pricing.pro_monthly.displayPrice,
    yearly: pricing.pro_yearly.displayPrice,
    yearlyPerMonth: euro(Math.round(pricing.pro_yearly.unitAmount / 12)),
    savingsPercent: Math.floor((1 - pricing.pro_yearly.unitAmount / (pricing.pro_monthly.unitAmount * 12)) * 100),
  } : FALLBACK);

  const buy = async () => {
    if (!billing.available) {
      setNotice('In-App-Kauf ist in dieser App-Version noch nicht verfügbar.');
      return;
    }
    setBusy(true);
    setNotice('');
    capture('checkout_started', { plan, provider: billing.provider, placement: 'onboarding' });
    try {
      const result = await billing.purchase(plan);
      if (result.redirectUrl) {
        await onDone('free');
        window.location.href = result.redirectUrl;
        return;
      }
      if (result.active) {
        capture('purchase_completed', { plan, provider: billing.provider, placement: 'onboarding' });
        setUnlocked(true);
      }
    } catch (error) {
      logger.error('Billing', 'Onboarding checkout failed', error);
      setNotice(getUserErrorMessage(error, 'billing'));
    } finally {
      setBusy(false);
    }
  };

  const close = () => { void onDone('free'); };

  return (
    <>
      <div className="onb-hd end">
        <button type="button" className="onb-round" onClick={close} aria-label="Schließen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="onb-bd">
        <div className="onb-ill"><img src={ONB_IMG.pro} alt="" style={{ height: 90 }} /></div>
        <div className="onb-q" style={{ fontSize: 28 }}>Werde zum <span className="onb-pro">Pro</span>fikoch</div>
        <div className="onb-sub" style={{ marginTop: -12 }}>Cookly Pro: dein Kochbuch ohne Limits</div>
        <div className="onb-opts" style={{ gap: 6, padding: '0 10px' }}>
          {PRO_FEATURES.map((f) => (
            <div key={f} className="onb-feat"><i><Check size={12} strokeWidth={3.2} /></i>{f}</div>
          ))}
        </div>
        <div className="onb-opts" style={{ gap: 10, marginTop: 2 }}>
          <button type="button" className="onb-plan" aria-pressed={plan === 'pro_yearly'} onClick={() => setPlan('pro_yearly')}>
            {prices.savingsPercent !== null && prices.savingsPercent > 0 && <span className="badge">{prices.savingsPercent} % günstiger</span>}
            <span><b>Jährlich</b>{prices.yearlyPerMonth && <span style={{ fontSize: 13, color: 'var(--o-muted)' }}> · {prices.yearlyPerMonth}/Monat</span>}</span>
            <b>{prices.yearly}</b>
          </button>
          <button type="button" className="onb-plan" aria-pressed={plan === 'pro_monthly'} onClick={() => setPlan('pro_monthly')}>
            <b>Monatlich</b>
            <b>{prices.monthly}</b>
          </button>
        </div>
        {notice && <div className="onb-err">{notice}</div>}
      </div>
      <div className="onb-ft">
        <button type="button" className="onb-cta" onClick={buy} disabled={busy}>
          {busy ? 'Wird vorbereitet …' : 'Pro freischalten'}
        </button>
        <button type="button" className="onb-ghost" onClick={close} disabled={busy}>Kostenlos weiter</button>
        <div className="onb-legal">
          {billing.provider === 'store' && <p>Verlängert sich automatisch, wenn du nicht spätestens 24 Stunden vor Ablauf in deinem Store-Account kündigst.</p>}
          <ExternalLink href={LEGAL_LINKS.terms}>Nutzungsbedingungen (EULA)</ExternalLink>
          <span aria-hidden="true"> · </span>
          <ExternalLink href={LEGAL_LINKS.privacy}>Datenschutz</ExternalLink>
        </div>
      </div>
      {unlocked && (
        <ProUnlocked synced={(currentUser?.subscription ?? 'free') !== 'free'} onContinue={() => { void onDone('purchased'); }} />
      )}
    </>
  );
};
