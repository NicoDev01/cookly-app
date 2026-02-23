import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import Stripe from "stripe";

// ============================================================
// INLINE PRICING - Keine Price-IDs aus Env-Variablen nötig!
// Preise werden direkt beim Erstellen der Checkout Session
// via price_data + product_data definiert.
// Laut Stripe Docs (https://docs.stripe.com/billing/subscriptions):
// price_data.product_data erlaubt vollständig inline Produkt-Definition.
// ============================================================
export const PLAN_PRICES = {
  pro_monthly: {
    unit_amount: 299, // 2,99 € in Cent
    currency: "eur",
    interval: "month" as const,
    product_name: "Cookly Pro (Monatlich)",
  },
  pro_yearly: {
    unit_amount: 2499, // 24,99 € in Cent
    currency: "eur",
    interval: "year" as const,
    product_name: "Cookly Pro (Jährlich)",
  },
} as const;

export type PlanId = keyof typeof PLAN_PRICES;

// ============================================================
// STRIPE INSTANCE
// ============================================================
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeInstance = new Stripe(apiKey, {
      apiVersion: "2025-12-15.clover",
    });
  }
  return stripeInstance;
}

// ============================================================
// ACTIONS - Checkout & Portal
// ============================================================

/**
 * Create Checkout Session for Subscription
 * Nutzt price_data + product_data (inline) - keine Price-IDs nötig!
 */
export const createCheckoutSession = action({
  args: {
    planId: v.union(v.literal("pro_monthly"), v.literal("pro_yearly")),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ checkoutUrl: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const clerkId = identity.subject;

    // User laden und Stripe Customer ID holen/erstellen
    const user = await ctx.runQuery(internal.stripeInternal.getUserByClerkId, {
      clerkId,
    });

    let stripeCustomerId = user?.stripeCustomerId;

    // Falls keine Customer ID existiert, neue erstellen
    if (!stripeCustomerId) {
      const customer = await getStripe().customers.create({
        email: identity.email,
        name: identity.name,
        metadata: { clerkId },
      });
      stripeCustomerId = customer.id;

      // Speichern in Convex
      await ctx.runMutation(internal.users.updateSubscriptionByClerkId, {
        clerkId,
        stripeCustomerId,
        subscription: user?.subscription || "free",
        subscriptionStatus: user?.subscriptionStatus || "active",
      });
    }

    const plan = PLAN_PRICES[args.planId];

    // Checkout Session mit inline price_data erstellen
    // Kein vorhandenes Produkt oder Price-ID im Stripe Dashboard nötig!
    const session = await getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card", "paypal"],
      line_items: [
        {
          price_data: {
            currency: plan.currency,
            unit_amount: plan.unit_amount,
            product_data: {
              name: plan.product_name,
              metadata: { planId: args.planId },
            },
            recurring: {
              interval: plan.interval,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        clerkId,
        planId: args.planId,
      },
      subscription_data: {
        metadata: {
          clerkId,
          planId: args.planId,
        },
      },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error("Failed to create checkout session");
    }

    return { checkoutUrl: session.url };
  },
});

/**
 * Create Portal Session (für Kündigung/Management)
 */
export const createPortalSession = action({
  args: {
    returnUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ portalUrl: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const clerkId = identity.subject;

    const user = await ctx.runQuery(internal.stripeInternal.getUserByClerkId, {
      clerkId,
    });

    if (!user?.stripeCustomerId) {
      throw new Error("No Stripe customer found");
    }

    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: args.returnUrl,
    });

    if (!portalSession.url) {
      throw new Error("Failed to create portal session");
    }

    return { portalUrl: portalSession.url };
  },
});

/**
 * Cancel Subscription (direkt, ohne Portal)
 */
export const cancelSubscription = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const clerkId = identity.subject;

    const user = await ctx.runQuery(internal.stripeInternal.getUserByClerkId, {
      clerkId,
    });

    if (!user?.stripeSubscriptionId) {
      throw new Error("No active subscription found");
    }

    // Subscription bei Stripe canceln (am Periodenende)
    await getStripe().subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // In Convex markieren dass Counter bei Downgrade resetted werden sollen
    await ctx.runMutation(internal.users.markForDowngrade, {
      clerkId,
    });

    return { success: true };
  },
});

// ============================================================
// INTERNAL ACTION - Handle Webhook Event
// ============================================================

export const handleWebhookEvent = internalAction({
  args: {
    eventType: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    switch (args.eventType) {
      // ============================================================
      // CHECKOUT COMPLETED - Neue Subscription
      // ============================================================
      case "checkout.session.completed": {
        const session = args.data as Stripe.Checkout.Session;
        const clerkId = session.metadata?.clerkId;
        const planId = session.metadata?.planId as PlanId | undefined;

        if (!clerkId) {
          console.error("[Stripe] Missing clerkId in checkout session metadata");
          return;
        }

        // Subscription-Daten direkt aus der Stripe Subscription holen
        // (exakte Daten statt geschätzte Zeiträume)
        let subscription: "pro_monthly" | "pro_yearly" = "pro_monthly";
        let periodEnd: number = Date.now() + 30 * 24 * 60 * 60 * 1000;

        if (planId === "pro_yearly") {
          subscription = "pro_yearly";
        }

        // Wenn Subscription-ID vorhanden, echte Daten von Stripe holen
        if (session.subscription) {
          try {
            const stripeSubscription = await getStripe().subscriptions.retrieve(
              session.subscription as string
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const subData = stripeSubscription as any;
            if (subData.current_period_end) {
              periodEnd = subData.current_period_end * 1000;
            }

            // Plan aus Subscription-Metadaten bestimmen (Fallback auf planId)
            const subPlanId = subData.metadata?.planId as PlanId | undefined;
            if (subPlanId === "pro_yearly" || planId === "pro_yearly") {
              subscription = "pro_yearly";
            }
          } catch (err) {
            console.error("[Stripe] Failed to retrieve subscription details:", err);
            // Fallback: geschätzte Daten verwenden
            if (planId === "pro_yearly") {
              periodEnd = Date.now() + 365 * 24 * 60 * 60 * 1000;
            }
          }
        }

        await ctx.runMutation(internal.users.updateSubscriptionByClerkId, {
          clerkId,
          subscription,
          subscriptionStatus: "active",
          subscriptionStartDate: Date.now(),
          subscriptionEndDate: periodEnd,
          stripeSubscriptionId: session.subscription as string,
          stripeCustomerId: session.customer as string,
        });

        console.log(`[Stripe] User ${clerkId} upgraded to ${subscription} until ${new Date(periodEnd).toISOString()}`);
        break;
      }

      // ============================================================
      // SUBSCRIPTION UPDATED - Statusänderung / Renewal
      // ============================================================
      case "customer.subscription.updated": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subUpdated = args.data as any;
        const stripeCustomerId = subUpdated.customer as string;
        const periodEnd = (subUpdated.current_period_end ?? 0) * 1000;

        // Wurde cancel_at_period_end gesetzt? (User hat gekündigt)
        if (subUpdated.cancel_at_period_end) {
          await ctx.runMutation(internal.users.markForDowngradeByStripeCustomer, {
            stripeCustomerId,
            subscriptionEndDate: periodEnd,
          });

          console.log(`[Stripe] Customer ${stripeCustomerId} marked for downgrade at ${new Date(periodEnd).toISOString()}`);
        } else if (subUpdated.status === "active") {
          // Renewal oder Reaktivierung: Enddatum aktualisieren
          await ctx.runMutation(internal.users.updateSubscriptionStatusByStripeCustomer, {
            stripeCustomerId,
            subscriptionStatus: "active",
          });
          console.log(`[Stripe] Customer ${stripeCustomerId} subscription renewed/reactivated`);
        }
        break;
      }

      // ============================================================
      // SUBSCRIPTION DELETED - Subscription abgelaufen/gekündigt
      // ============================================================
      case "customer.subscription.deleted": {
        const subscription = args.data as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        // User laden
        const user = await ctx.runQuery(internal.stripeInternal.getUserByStripeCustomerId, {
          stripeCustomerId,
        });

        if (!user) {
          console.error(`[Stripe] User with stripeCustomerId ${stripeCustomerId} not found`);
          return;
        }

        // DOWNGRADE: Pro -> Free
        await ctx.runMutation(internal.users.updateSubscriptionByStripeCustomer, {
          stripeCustomerId,
          subscription: "free",
          subscriptionStatus: "canceled",
          subscriptionEndDate: undefined,
          subscriptionStartDate: undefined,
          stripeSubscriptionId: undefined,
        });

        // Counter resetten (nur wenn markiert)
        if (user.usageStats?.resetOnDowngrade) {
          await ctx.runMutation(internal.users.resetUsageCounters, {
            clerkId: user.clerkId,
          });
        }

        console.log(`[Stripe] User ${user.clerkId} downgraded to Free. Counters reset: ${user.usageStats?.resetOnDowngrade}`);
        break;
      }

      // ============================================================
      // INVOICE PAYMENT FAILED - Zahlung fehlgeschlagen
      // ============================================================
      case "invoice.payment_failed": {
        const invoice = args.data as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;

        await ctx.runMutation(internal.users.updateSubscriptionStatusByStripeCustomer, {
          stripeCustomerId,
          subscriptionStatus: "past_due",
        });

        console.log(`[Stripe] Payment failed for customer ${stripeCustomerId}`);
        break;
      }

      // ============================================================
      // INVOICE PAYMENT SUCCEEDED - Zahlung erfolgreich (Renewal)
      // ============================================================
      case "invoice.payment_succeeded": {
        const invoice = args.data as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;

        // Nur bei Renewals (billing_reason = "subscription_cycle")
        if (invoice.billing_reason === "subscription_cycle") {
          await ctx.runMutation(internal.users.updateSubscriptionStatusByStripeCustomer, {
            stripeCustomerId,
            subscriptionStatus: "active",
          });
          console.log(`[Stripe] Renewal payment succeeded for customer ${stripeCustomerId}`);
        }
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event: ${args.eventType}`);
    }
  },
});
