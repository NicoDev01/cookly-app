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

const PRO_FEATURES_MONTHLY = [
  "Unlimitierte Rezepte speichern",
  "Unlimitierte KI-Scans & Foto-Uploads",
  "Unlimitierte Rezepte von URLs importieren",
  "Jederzeit kündbar",
];

const PRO_FEATURES_YEARLY = [
  "Alle Pro-Funktionen",
  "Priorisierter Support",
  "Frühzeitiger Zugriff auf neue Updates",
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
  const [isYearly, setIsYearly] = useState(false);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [nativePrices, setNativePrices] = useState<Partial<Record<"pro_monthly" | "pro_yearly", string>>>({});
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
    void billing.prices().then((prices) => prices && setNativePrices(prices)).catch(() => undefined);
  }, [billing, currentUser?.billingUserId]);

  const { isLoadingUser, isPro } = getSubscriptionViewState(currentUser);
  const nativeBillingUnavailable = billing.provider === "store" && !billing.available;
  const nativeBillingMessage =
    "In-App-Kauf ist in dieser App-Version noch nicht aktiviert. Bitte verwende bis zur Store-Freischaltung die Web-Version.";

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
  const billingLabel =
    selectedPlan?.billingLabel ??
    (isYearly ? "Jährliche Abrechnung (Gesamt 24,99 €)" : "Monatliche Abrechnung (Gesamt 35,88 €/Jahr)");

  return (
    <div className="min-h-screen bg-background text-foreground font-sans pb-20">
      {/* Wave Background Decorative Element */}
      <div className="absolute inset-0 -z-10 h-full w-full bg-white dark:bg-slate-950 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>

      <div className="container mx-auto px-4 py-8">
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
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Koche wie ein <span className="text-primary italic">Profi</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Schalte das volle Potenzial von Cookly frei. Unbegrenzte Rezepte, KI-Power und nahtlose Planung.
          </p>
        </div>

        {/* Premium Plan Selector Buttons */}
        <div className="flex items-center justify-center gap-4 mb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
          </Button>
        </div>

        {/* Single Pro Pricing Card */}
        <div className="max-w-xl mx-auto">
          <Card className="flex flex-col border-2 border-primary bg-primary/5 backdrop-blur-sm shadow-2xl shadow-primary/10 relative overflow-hidden group">
            {/* Ribbon/Banner fixed */}
            {!isYearly && (
              <div className="absolute top-6 -right-12 px-14 py-1.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest transform rotate-45 z-10">
                Empfohlen
              </div>
            )}
            
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
                {(isYearly ? [...PRO_FEATURES_MONTHLY, ...PRO_FEATURES_YEARLY] : PRO_FEATURES_MONTHLY).map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-base group-hover:translate-x-1 transition-transform">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="font-medium">{feature}</span>
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
          <div className="flex items-center justify-center gap-8 mb-4">
            <div className="flex flex-col items-center gap-1 opacity-50 grayscale hover:grayscale-0 transition-all">
              <span className="material-symbols-outlined text-4xl">lock</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">Sicher</span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-50 grayscale hover:grayscale-0 transition-all">
              <span className="material-symbols-outlined text-4xl">payments</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {nativeBillingUnavailable ? "Store Billing" : "Stripe"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-50 grayscale hover:grayscale-0 transition-all">
              <span className="material-symbols-outlined text-4xl">verified</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">Garantie</span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-50 grayscale hover:grayscale-0 transition-all">
              <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">PayPal</span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-50 grayscale hover:grayscale-0 transition-all">
              <span className="material-symbols-outlined text-4xl">contactless</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">Google Pay</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {nativeBillingUnavailable ? "Abos in der App werden über den jeweiligen Store bereitgestellt." : "Sichere Zahlung über Stripe. Deine Daten werden verschlüsselt übertragen."}
            Jederzeit kündbar über die Profileinstellungen.
          </p>
          <div className="pt-4">
            <a 
              href="mailto:support@cookly.de" 
              className="text-xs font-bold text-primary hover:underline underline-offset-4"
            >
              Fragen? Support@Cookly.de
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
