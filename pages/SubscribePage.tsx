"use client";

import React, { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleCheck, Sparkles } from "lucide-react";
// Price IDs from Vite environment variables (auto-loaded from .env.production)
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const PRICE_IDS = {
  pro_monthly: import.meta.env.VITE_STRIPE_PRICE_MONTHLY,
  pro_yearly: import.meta.env.VITE_STRIPE_PRICE_YEARLY,
};

const FREE_FEATURES = [
  "100 Manuelle Rezepte",
  "50 Link-Imports (Instagram/Website)",
  "50 KI-Foto-Scans",
  "Unbegrenzte Wochenplanung",
  "Unbegrenzte Einkaufslisten",
  "Unbegrenzte Favoriten",
];

const PRO_FEATURES_MONTHLY = [
  "Unlimitierte Rezepte speichern",
  "Unlimitierte KI-Scans & Foto-Uploads",
  "Unlimitierte Rezepte von URLs importieren",
  "Vollständige Wochenplanung",
  "Einkaufslisten-Synchronisation",
  "Jederzeit kündbar",
];

const PRO_FEATURES_YEARLY = [
  "Alle Pro-Funktionen",
  "Priorisierter Support",
  "Frühzeitiger Zugriff auf neue Updates",
];

export default function SubscribePage() {
  const handleBack = useBackNavigation();
  const currentUser = useQuery(api.users.getCurrentUser);
  const createCheckout = useAction(api.stripe.createCheckoutSession);
  const createPortal = useAction(api.stripe.createPortalSession);
  const [loading, setLoading] = useState<string | null>(null);
  const [isYearly, setIsYearly] = useState(true);

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const isPro = currentUser?.subscription !== "free";
  const currentPlan = currentUser?.subscription || "free";

  const handleSubscribe = async (priceId: string, planId: string) => {
    setLoading(planId);
    try {
      const baseUrl = window.location.origin;
      const result = await createCheckout({
        priceId,
        successUrl: `${baseUrl}/#/profile?success=true`,
        cancelUrl: `${baseUrl}/#/subscribe?canceled=true`,
      });

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Fehler beim Erstellen der Checkout-Session. Bitte versuche es erneut.");
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setLoading("manage");
    try {
      const baseUrl = window.location.origin;
      const result = await createPortal({
        returnUrl: `${baseUrl}/#/profile`,
      });

      if (result.portalUrl) {
        window.location.href = result.portalUrl;
      }
    } catch (error) {
      console.error("Portal error:", error);
      alert("Fehler beim Öffnen des Kundenportals");
    } finally {
      setLoading(null);
    }
  };

  const proPrice = isYearly ? "€50" : "€5";
  const proPeriod = isYearly ? "Jahr" : "Monat";
  const proPriceId = isYearly ? PRICE_IDS.pro_yearly : PRICE_IDS.pro_monthly;
  const proPlanId = isYearly ? "pro_yearly" : "pro_monthly";

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
            <div className="absolute top-6 -right-12 px-14 py-1.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest transform rotate-45 z-10">
              Empfohlen
            </div>
            
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
                <p className={cn(
                  "text-sm font-medium mt-2 transition-colors",
                  isYearly ? "text-primary" : "text-muted-foreground"
                )}>
                  {isYearly ? "Jährliche Abrechnung (Gesamt €50)" : "Monatliche Abrechnung (Gesamt €60/Jahr)"}
                </p>
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
            
            <CardFooter className="pt-8">
              {isPro ? (
                <Button 
                  onClick={handleManageSubscription}
                  disabled={loading === 'manage'}
                  className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-full"
                >
                  {loading === 'manage' ? (
                    <span className="flex items-center gap-2">
                       <span className="w-5 h-5 border-3 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                       Lädt...
                    </span>
                  ) : (
                    "Abo verwalten"
                  )}
                </Button>
              ) : (
                <Button 
                  onClick={() => handleSubscribe(proPriceId, proPlanId)}
                  disabled={loading === proPlanId}
                  className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 group/btn rounded-full"
                >
                  {loading === proPlanId ? (
                    <span className="flex items-center gap-2">
                       <span className="w-5 h-5 border-3 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                       Wird vorbereitet...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Jetzt upgraden
                      <ArrowRight className="h-5 w-5 group-hover/btn:translate-x-1 transition-transform" />
                    </span>
                  )}
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
              <span className="text-[10px] font-bold uppercase tracking-widest">Stripe</span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-50 grayscale hover:grayscale-0 transition-all">
              <span className="material-symbols-outlined text-4xl">verified</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">Garantie</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Sichere Zahlung über Stripe. Deine Daten werden verschlüsselt übertragen. 
            Jederzeit kündbar über die Profileinstellungen.
          </p>
          <div className="pt-4">
            <a 
              href="mailto:support@cookly.app" 
              className="text-xs font-bold text-primary hover:underline underline-offset-4"
            >
              FRAGEN? SUPPORT@COOKLY.APP
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
