"use client";

import React, { useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useQuery, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import {
  LogOut,
  Trash2,
  Crown,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Link2,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export const ProfilePage: React.FC = () => {
  const { user, isLoaded: userLoaded } = useUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const currentUser = useQuery(api.users.getCurrentUser);
  const cancelSubscription = useAction(api.stripe.cancelSubscription);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Usage Stats
  const manualLimit = useQuery(api.users.canCreateManualRecipe);
  const linkLimit = useQuery(api.users.canImportFromLink);
  const scanLimit = useQuery(api.users.canScanPhoto);

  const handleSignOut = async () => {
    await signOut({ redirectUrl: '/sign-in' });
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'LÖSCHEN') return;
    setIsDeleting(true);
    try {
      await user?.delete();
      window.location.hash = '#/sign-in';
    } catch (error: any) {
      console.error('Error deleting account:', error);
      alert(`Fehler beim Löschen: ${error.message}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    try {
      await cancelSubscription();
      setShowCancelModal(false);
      window.location.reload();
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      alert(`Fehler beim Kündigen: ${error.message}`);
    } finally {
      setIsCancelling(false);
    }
  };

  if (!userLoaded || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const safeCurrentUser = currentUser ?? {
    subscription: 'free' as const,
    usageStats: { manualRecipes: 0, linkImports: 0, photoScans: 0 },
  };

  const isPro = safeCurrentUser.subscription !== 'free';
  const isMarkedForCancel = currentUser?.usageStats?.resetOnDowngrade || false;
  const subscriptionEndDate = currentUser?.usageStats?.subscriptionEndDate
    ? new Date(currentUser.usageStats.subscriptionEndDate)
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans pt-safe pb-safe select-none">
      {/* Decorative Background - Direct match from SubscribePage */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-white dark:bg-slate-950 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>

      <div className="container mx-auto px-4 py-6 max-w-xl">
        {/* Header Section - Matches SubscribePage Hero styling */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="relative inline-block mb-6 group">
            <div className={cn(
              "w-28 h-28 sm:w-32 sm:h-32 rounded-full border-[6px] shadow-2xl overflow-hidden mx-auto transition-transform duration-500 active:scale-105",
              isPro ? "border-primary shadow-primary/20" : "border-white dark:border-slate-800"
            )}>
              {user.imageUrl ? (
                <img src={user.imageUrl} alt={user.fullName || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
                  <span className="text-4xl font-bold">{user.firstName?.[0]}</span>
                </div>
              )}
            </div>
            {isPro && (
              <div className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground p-3 rounded-full shadow-lg border-[4px] border-white dark:border-background animate-in zoom-in spin-in-12 duration-500 delay-300">
                <Crown className="w-6 h-6 fill-current" />
              </div>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-2 text-primary">
            {user.primaryEmailAddress?.emailAddress || "User"}
          </h1>
        </div>

        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          {/* Main Membership & Stats Card */}
          <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
            <Card className={cn(
              "flex flex-col border-[3px] border-primary bg-primary/5 backdrop-blur-sm shadow-2xl shadow-primary/10 relative overflow-hidden group transition-all duration-300",
              !isPro && "border-primary/60"
            )}>
              {/* Ribbon - only for Pro */}
              {isPro && (
                <div className="absolute top-6 -right-12 px-14 py-1.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest transform rotate-45 z-10 shadow-sm">
                  MITGLIED
                </div>
              )}

              <CardHeader className={cn("pb-8", !isPro && "text-center")}>
                <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
                  {isPro ? "Dein Plan" : "Dein aktueller Plan:"}
                  {isPro && <Sparkles className="h-5 w-5 text-primary fill-primary/20" />}
                </CardTitle>
                <CardDescription className={cn(!isPro && "text-center")}>
                  {isPro ? "Alle Features freigeschaltet" : "Upgrade für mehr Möglichkeiten"}
                </CardDescription>

                {/* Status Display */}
                <div className="mt-4 flex flex-col items-center">
                  {isPro ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-bold tracking-tight text-primary">
                        Pro
                      </span>
                      <span className="text-muted-foreground text-lg">/Aktiv</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-bold tracking-tight text-primary">
                        Free
                      </span>
                    </div>
                  )}
                  <p className="text-sm font-medium mt-2 text-muted-foreground text-center">
                    {isPro
                      ? (isMarkedForCancel
                          ? `Läuft aus am ${subscriptionEndDate?.toLocaleDateString('de-DE')}`
                          : `Nächste Abrechnung: ${subscriptionEndDate?.toLocaleDateString('de-DE')}`)
                      : "Upgrade für mehr Rezepte"
                    }
                  </p>
                </div>
              </CardHeader>

              <CardContent className="flex-grow">
                <Separator className="mb-8 bg-primary/20" />

                {isPro ? (
                  // PRO CONTENT
                   <div className="space-y-4">
                      <div className="flex items-start gap-3 group/item">
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="font-medium">Unbegrenzte Rezepte & Importe</span>
                      </div>
                      <div className="flex items-start gap-3 group/item">
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="font-medium">KI-Funktionen freigeschaltet</span>
                      </div>
                      <div className="flex items-start gap-3 group/item">
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="font-medium">Jederzeit kündbar</span>
                      </div>
                   </div>
                ) : (
                  // FREE CONTENT - with TRACKERS integrated
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <UsageRow
                        label="Eigene Rezepte"
                        current={manualLimit?.current ?? 0}
                        limit={manualLimit?.limit ?? 100}
                        icon={BookOpen}
                      />
                      <UsageRow
                        label="URL Importe"
                        current={linkLimit?.current ?? 0}
                        limit={linkLimit?.limit ?? 50}
                        icon={Link2}
                      />
                      <UsageRow
                        label="KI Scans"
                        current={scanLimit?.current ?? 0}
                        limit={scanLimit?.limit ?? 50}
                        icon={Sparkles}
                      />
                    </div>
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-8">
                {isPro ? (
                  <div className="w-full flex flex-col gap-3">
                     <Button
                        onClick={() => navigate('/tabs/subscribe')}
                        variant="outline"
                        className="w-full h-14 text-lg font-bold rounded-full border-primary/20 active:bg-primary/5 active:text-primary transition-all"
                      >
                        Abo verwalten
                      </Button>
                      {!isMarkedForCancel && (
                        <button
                          onClick={() => setShowCancelModal(true)}
                          className="text-xs font-bold text-muted-foreground active:text-destructive transition-colors uppercase tracking-widest py-2"
                        >
                          Abo kündigen
                        </button>
                      )}
                  </div>
                ) : (
                  <Button
                    onClick={() => navigate('/tabs/subscribe')}
                    className="w-full h-14 text-lg font-bold bg-primary active:bg-primary/80 text-primary-foreground shadow-lg shadow-primary/20 group/btn rounded-full"
                  >
                    <span className="flex items-center justify-center gap-2">
                      Jetzt upgraden
                      <ArrowRight className="h-5 w-5 group-active/btn:translate-x-1 transition-transform" />
                    </span>
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>

          {/* Action Buttons - Pill Style */}
          <div className="space-y-3 max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="w-full h-14 text-base font-bold rounded-full border-primary/20 active:bg-primary/5 active:text-primary transition-all shadow-sm active:scale-[0.98]"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Abmelden
            </Button>

            <Button
              onClick={() => setShowDeleteModal(true)}
              variant="outline"
              className="w-full h-14 text-base font-bold rounded-full border-destructive/30 text-destructive active:bg-destructive/5 active:border-destructive/50 transition-all shadow-sm active:scale-[0.98]"
            >
              <Trash2 className="w-5 h-5 mr-2" />
              Konto löschen
            </Button>
          </div>

          {/* Footer Info */}
          <div className="pt-8 pb-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400">
             <a
               href="#/legal"
               className="text-xs font-bold text-primary active:underline underline-offset-4"
             >
               Datenschutz & Impressum
             </a>
          </div>
        </div>
      </div>

      {/* Cancel Modal - Bottom Sheet Style */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-background rounded-t-[2rem] p-6 pb-safe animate-in slide-in-from-bottom duration-400 border-t border-white/10 shadow-2xl">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />
            <div className="bg-destructive/10 p-4 rounded-2xl w-fit mb-6 mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold mb-3 text-center">Abo wirklich kündigen?</h2>
            <p className="text-sm text-muted-foreground mb-8 leading-relaxed text-center">
              Deine Vorteile bleiben bis zum <strong className="text-foreground">{subscriptionEndDate?.toLocaleDateString('de-DE')}</strong> aktiv.
            </p>
            <div className="flex flex-col gap-3">
              <Button
                variant="destructive"
                className="w-full h-14 text-lg font-bold shadow-lg shadow-destructive/20 rounded-full active:scale-[0.98]"
                onClick={handleCancelSubscription}
                disabled={isCancelling}
              >
                {isCancelling ? "Kündigt..." : "Ja, Abo kündigen"}
              </Button>
              <Button
                variant="outline"
                className="w-full h-14 text-lg font-bold rounded-full active:scale-[0.98]"
                onClick={() => setShowCancelModal(false)}
              >
                Behalten
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal - Bottom Sheet Style */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-background rounded-t-[2rem] p-6 pb-safe animate-in slide-in-from-bottom duration-400 border-t border-white/10 shadow-2xl">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-3 text-destructive text-center">Konto löschen?</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed text-center">
              Diese Aktion ist unwiderruflich. Alle deine Rezepte gehen verloren.
            </p>
            <div className="relative mb-8">
                <input
                  className="w-full h-14 bg-muted/30 rounded-full px-6 font-bold border-2 border-transparent focus:border-destructive transition-all outline-none text-center tracking-[0.2em] text-lg uppercase placeholder:normal-case"
                  placeholder='Tippe "LÖSCHEN"'
                  onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                />
            </div>
            <div className="flex flex-col gap-3">
              <Button
                variant="destructive"
                className="w-full h-14 text-lg font-bold shadow-lg shadow-destructive/20 rounded-full active:scale-[0.98]"
                disabled={isDeleting || deleteConfirmText !== 'LÖSCHEN'}
                onClick={handleDeleteAccount}
              >
                {isDeleting ? "Wird gelöscht..." : "Endgültig löschen"}
              </Button>
              <Button
                variant="outline"
                className="w-full h-14 text-lg font-bold rounded-full active:scale-[0.98]"
                onClick={() => setShowDeleteModal(false)}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub-components (Styled) ---

const UsageRow = ({ icon: Icon, label, current, limit }: { icon: any, label: string, current: number, limit: number }) => {
  const percentage = Math.min((current / limit) * 100, 100);
  const isFull = percentage >= 100;

  return (
    <div className="space-y-3 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2.5 rounded-xl transition-colors",
            isFull ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
          )}>
            <Icon className="w-5 h-5" />
          </div>
          <span className="font-bold text-base">{label}</span>
        </div>
        <span className={cn(
            "text-sm font-bold px-2 py-0.5 rounded-md tabular-nums",
            isFull ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
        )}>
          {current} / {limit}
        </span>
      </div>
      <div className="h-5 w-full bg-muted/50 rounded-full overflow-hidden shadow-sm">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden",
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
