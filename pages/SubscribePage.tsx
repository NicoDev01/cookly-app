import React, { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { Capacitor } from "@capacitor/core";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { logger } from "@/utils/logger";
import { getSubscriptionViewState } from "@/utils/subscriptionStatus";
import { useNotification } from "@/contexts/NotificationContext";
import { getUserErrorMessage } from "@/utils/userErrors";
import { createBillingClient } from "@/services/billing";
import { capture } from "@/services/analytics";
import { showsExternalPaymentBranding } from "@/utils/paymentBranding";
import ExternalLink from "@/components/ExternalLink";
import { LEGAL_LINKS } from "@/utils/legalLinks";
import { ONB_IMG } from "@/components/onboarding/onboardingData";
import { FREE_LIMITS } from "@/convex/constants";

/** Was Pro wirklich freischaltet: Free hat nur Kontingente für Importe und Scans. */
const PRO_FEATURES = [
  { label: "Unbegrenzt Rezepte importieren", hint: "Instagram, TikTok, Facebook und Websites" },
  { label: "Unbegrenzt Rezepte scannen", hint: "Kochbuchseiten, Rezeptkarten und Fotos" },
  { label: "Jederzeit kündbar" },
];

export default function SubscribePage() {
  React.useEffect(() => {
    capture("paywall_viewed");
  }, []);
  const handleBack = useBackNavigation();
  const currentUser = useQuery(api.users.getCurrentUser);
  const pricing = useQuery(api.stripe.getPlanPricing);
  const billingSummary = useQuery(api.billing.getSummary);
  const createCheckout = useAction(api.stripe.createCheckoutSession);
  const createPortal = useAction(api.stripe.createPortalSession);
  const ensureBillingUserId = useMutation(api.users.ensureBillingUserId);
  const [loading, setLoading] = useState<string | null>(null);
  const [pickedYearly, setIsYearly] = useState(false);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [nativePrices, setNativePrices] = useState<Partial<Record<"pro_monthly" | "pro_yearly", string>>>({});
  const [nativeSavings, setNativeSavings] = useState<number | null>(null);
  const { showToast } = useNotification();
  const billing = useMemo(() => createBillingClient(currentUser?.billingUserId, {
    checkout: createCheckout,
    portal: createPortal,
  }), [currentUser?.billingUserId, createCheckout, createPortal]);

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform() || currentUser === undefined || currentUser === null || currentUser.billingUserId) return;
    void ensureBillingUserId();
  }, [currentUser, ensureBillingUserId]);

  React.useEffect(() => {
    if (billing.provider !== "store" || !billing.available || !currentUser?.billingUserId) return;
    void billing.prices().then((prices) => {
      if (!prices) return;
      setNativePrices(prices);
      setNativeSavings(prices.yearlySavingsPercent);
    }).catch(() => undefined);
  }, [billing, currentUser?.billingUserId]);

  const { isLoadingUser, isPro } = getSubscriptionViewState(currentUser);
  // Pro-Nutzer sehen ihren Plan statt der Auswahl.
  const isYearly = isPro ? currentUser?.subscription === "pro_yearly" : pickedYearly;
  const nativeBillingUnavailable = billing.provider === "store" && !billing.available;
  const nativeBillingMessage = "In-App-Kauf ist in dieser App-Version noch nicht verfügbar.";

  const handleSubscribe = async (planId: "pro_monthly" | "pro_yearly") => {
    if (!billing.available) {
      setBillingNotice(nativeBillingMessage);
      return;
    }

    setLoading(planId);
    setBillingNotice(null);
    capture("checkout_started", { plan: planId, provider: billing.provider });
    try {
      const result = await billing.purchase(planId);
      if (result.redirectUrl) window.location.href = result.redirectUrl;
      if (result.active) {
        capture("purchase_completed", { plan: planId, provider: billing.provider });
        setBillingNotice("Kauf bestätigt. Die Pro-Berechtigung wird synchronisiert.");
        showToast("Pro wurde aktiviert.", "success");
      }
    } catch (error) {
      logger.error('Billing', 'Checkout failed', error);
      showToast(getUserErrorMessage(error, 'billing'), 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!billing.available) {
      setBillingNotice(nativeBillingMessage);
      return;
    }
    if (billing.provider === "store" && !billingSummary?.providers.some((provider) => provider === "google_play" || provider === "app_store")) {
      setBillingNotice("Dieses Abo wurde im Web abgeschlossen und kann dort verwaltet werden.");
      return;
    }

    setLoading("manage");
    setBillingNotice(null);
    try {
      const redirectUrl = await billing.manage();
      if (redirectUrl) window.location.href = redirectUrl;
    } catch (error) {
      logger.error('Billing', 'Portal failed', error);
      showToast(getUserErrorMessage(error, 'billing'), 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleRestore = async () => {
    setLoading("restore");
    try {
      const active = await billing.restore();
      setBillingNotice(active ? "Käufe wiederhergestellt. Die Pro-Berechtigung wird synchronisiert." : "Kein aktives Store-Abo gefunden.");
    } catch (error) {
      logger.error("Billing", "Restore failed", error);
      showToast(getUserErrorMessage(error, "billing"), "error");
    } finally {
      setLoading(null);
    }
  };

  const proPlanId = (isYearly ? "pro_yearly" : "pro_monthly") as "pro_monthly" | "pro_yearly";
  const selectedPlan = isYearly ? pricing?.pro_yearly : pricing?.pro_monthly;
  const proPrice = nativePrices[proPlanId] ?? selectedPlan?.displayPrice ?? (isYearly ? "24,99 €" : "2,99 €");
  const proPeriod = selectedPlan?.displayPeriod ?? (isYearly ? "Jahr" : "Monat");
  // Store-Preise kommen je Storefront aus StoreKit/Play; die Euro-Summen aus dem Stripe-Pricing würden dort nicht passen.
  const billingLabel = billing.provider === "store" ? (isYearly ? "Jährliche Abrechnung" : "Monatliche Abrechnung") :
    selectedPlan?.billingLabel ??
    (isYearly ? "Jährliche Abrechnung (Gesamt 24,99 €)" : "Monatliche Abrechnung (Gesamt 35,88 €/Jahr)");

  // Ersparnis des Jahresabos: im Store aus den Store-Preisen, sonst aus dem Stripe-Pricing.
  const yearlySavings = billing.provider === "store"
    ? nativeSavings
    : pricing ? Math.floor((1 - pricing.pro_yearly.unitAmount / (pricing.pro_monthly.unitAmount * 12)) * 100) : null;
  const endDate = currentUser?.usageStats?.subscriptionEndDate
    ? new Date(currentUser.usageStats.subscriptionEndDate).toLocaleDateString("de-DE")
    : null;
  const paymentFailed = currentUser?.subscriptionStatus === "past_due";
  const proStatus = paymentFailed
    ? "Zahlung fehlgeschlagen"
    : !endDate
      ? null
      : currentUser?.usageStats?.resetOnDowngrade
        ? `Gekündigt, aktiv bis ${endDate}`
        : `Verlängert sich am ${endDate}`;

  return (
    <div className="min-h-screen bg-muted text-foreground font-sans pb-20">

      <div className="container mx-auto px-4 pb-8" style={{ paddingTop: 'calc(var(--safe-area-inset-top, 0px) + 1rem)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="rounded-full bg-background/50 backdrop-blur-sm border shadow-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-16 space-y-4">
          <img src={ONB_IMG.pro} alt="" className="mx-auto h-24 w-auto" />
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Koche wie ein <span className="text-primary italic">Profi</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {isPro ? "Importe und Rezept-Scans sind für dich unbegrenzt." : "Importiere und scanne Rezepte ohne Limit."}
          </p>
          {!isPro && (
            <p className="text-sm text-muted-foreground">
              Free: {FREE_LIMITS.LINK_IMPORTS} Importe und {FREE_LIMITS.PHOTO_SCANS} Rezept-Scans
            </p>
          )}
        </div>

        {/* Premium Plan Selector Buttons */}
        {!isPro && <div className="flex items-center justify-center gap-4 mb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Button
            onClick={() => setIsYearly(false)}
            variant={!isYearly ? "default" : "outline"}
            className={cn(
              "h-12 px-8 rounded-full font-bold transition-all duration-300",
              !isYearly ? "shadow-lg shadow-primary/20 scale-105" : "text-muted-foreground border-muted-foreground/20"
            )}
          >
            Monatlich
          </Button>
          <Button
            onClick={() => setIsYearly(true)}
            variant={isYearly ? "default" : "outline"}
            className={cn(
              "h-12 px-8 rounded-full font-bold transition-all duration-300",
              isYearly ? "shadow-lg shadow-primary/20 scale-105" : "text-muted-foreground border-muted-foreground/20"
            )}
          >
            Jährlich
            {!!yearlySavings && yearlySavings > 0 && (
              <span className={cn("ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold", isYearly ? "bg-white/25 text-white" : "bg-primary/15 text-primary")}>
                −{yearlySavings} %
              </span>
            )}
          </Button>
        </div>}

        {/* Single Pro Pricing Card */}
        <div className="max-w-xl mx-auto">
          <Card className="flex flex-col border-2 border-primary bg-primary/5 backdrop-blur-sm shadow-2xl shadow-primary/10 relative overflow-hidden group">
            
            <CardHeader className="pb-8">
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                Pro
                <Sparkles className="h-5 w-5 text-primary fill-primary/20" />
              </CardTitle>
              <CardDescription>Für leidenschaftliche Köche</CardDescription>
              <div className="mt-4 flex flex-col">
                <div className="flex items-baseline gap-1">
                  <span className="text-6xl font-bold tracking-tight text-primary transition-all duration-300">
                    {proPrice}
                  </span>
                  <span className="text-muted-foreground text-xl">/{proPeriod}</span>
                </div>
                  <p className="text-sm font-medium mt-2 text-primary">
                    {billingLabel}
                  </p>
                  {isPro && proStatus && (
                    <p className={cn("mt-3 text-sm font-semibold", paymentFailed ? "text-destructive" : "text-foreground")}>
                      {proStatus}
                    </p>
                  )}
                  {nativeBillingUnavailable && (
                    <p className="mt-4 rounded-xl border border-primary/20 bg-background/70 p-3 text-sm text-muted-foreground">
                      {nativeBillingMessage}
                    </p>
                  )}
                  {billingNotice && (
                    <p className="mt-3 text-sm font-medium text-primary">
                      {billingNotice}
                    </p>
                  )}
                </div>
              </CardHeader>
            
            <CardContent className="flex-grow">
              <Separator className="mb-8 bg-primary/20" />
              <ul className="space-y-4">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature.label} className="flex items-start gap-3 text-base group-hover:translate-x-1 transition-transform">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span>
                      <span className="block font-medium">{feature.label}</span>
                      {feature.hint && <span className="block text-sm text-muted-foreground">{feature.hint}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
            
            <CardFooter className="pt-8 flex-col gap-3">
              {isLoadingUser ? (
                <Button
                  disabled
                  className="w-full h-14 text-lg font-bold bg-primary/80 text-primary-foreground shadow-lg shadow-primary/20 rounded-full"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-3 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Lädt...
                  </span>
                </Button>
              ) : isPro ? (
                <Button 
                  onClick={handleManageSubscription}
                  disabled={!billing.available || loading === 'manage'}
                  className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-full"
                >
                  {loading === 'manage' ? (
                    <span className="flex items-center gap-2">
                       <span className="w-5 h-5 border-3 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                       Lädt...
                    </span>
                  ) : (
                    nativeBillingUnavailable ? "Noch nicht verfügbar" : "Abo verwalten"
                  )}
                </Button>
              ) : (
                <Button 
                  onClick={() => handleSubscribe(proPlanId)}
                  disabled={!billing.available || loading === proPlanId}
                  className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 group/btn rounded-full"
                >
                  {loading === proPlanId ? (
                    <span className="flex items-center gap-2">
                       <span className="w-5 h-5 border-3 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                       Wird vorbereitet...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      {nativeBillingUnavailable ? "In-App-Kauf folgt" : "Jetzt upgraden"}
                      <ArrowRight className="h-5 w-5 group-hover/btn:translate-x-1 transition-transform" />
                    </span>
                  )}
                </Button>
              )}
              {billing.canRestore && (
                <Button variant="ghost" onClick={handleRestore} disabled={loading === "restore"} className="w-full h-12 rounded-full">
                  {loading === "restore" ? "Wird wiederhergestellt..." : "Käufe wiederherstellen"}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Footer Info */}
        <div className="mt-20 text-center max-w-2xl mx-auto space-y-6">
          <div className="flex items-start justify-center gap-4 mb-4">
            <div className="flex flex-col items-center gap-1 opacity-50 grayscale hover:grayscale-0 transition-all">
              <span className="material-symbols-outlined text-4xl">lock</span>
              <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider">Sicher</span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-50 grayscale hover:grayscale-0 transition-all">
              <span className="material-symbols-outlined text-4xl">payments</span>
              <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider">
                {showsExternalPaymentBranding ? "Stripe" : "Store Billing"}
              </span>
            </div>
            {showsExternalPaymentBranding && (
              <div className="flex flex-col items-center gap-1 opacity-50 grayscale hover:grayscale-0 transition-all">
                <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider">PayPal</span>
              </div>
            )}
            {showsExternalPaymentBranding && (
              <div className="flex flex-col items-center gap-1 opacity-50 grayscale hover:grayscale-0 transition-all">
                <span className="material-symbols-outlined text-4xl">contactless</span>
                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider">Google Pay</span>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {showsExternalPaymentBranding
              ? "Sichere Zahlung über Stripe. Deine Daten werden verschlüsselt übertragen. Jederzeit kündbar über die Profileinstellungen."
              : "Die Zahlung erfolgt über deinen Store-Account. Das Abo verlängert sich automatisch um den gewählten Zeitraum zum angezeigten Preis, wenn es nicht spätestens 24 Stunden vor Ablauf gekündigt wird. Kündigen und verwalten kannst du es jederzeit in den Abo-Einstellungen deines Store-Accounts."}
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
            <ExternalLink href={LEGAL_LINKS.terms} className="hover:underline">
              Nutzungsbedingungen (EULA)
            </ExternalLink>
            <span>•</span>
            <ExternalLink href={LEGAL_LINKS.privacy} className="hover:underline">
              Datenschutzerklärung
            </ExternalLink>
          </div>
          <div className="pt-2">
            <a 
              href="mailto:aimpact.agency@gmail.com"
              className="text-xs font-bold text-primary hover:underline underline-offset-4"
            >
              Fragen? aimpact.agency@gmail.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
