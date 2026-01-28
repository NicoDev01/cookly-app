import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import Stripe from "stripe";
// ============================================================
// PRICE IDs (€5/Monat, €50/Jahr)
// Loaded from environment variables
// ============================================================
export const PRICE_IDS = {
  pro_monthly: process.env.VITE_STRIPE_PRICE_MONTHLY!,
  pro_yearly: process.env.VITE_STRIPE_PRICE_YEARLY!,
};

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
      apiVersion: "2024-12-18.acacia",
    });
  }
  return stripeInstance;
}

// ============================================================
// ACTIONS - Checkout & Portal
// ============================================================

/**
 * Create Checkout Session for Subscription
 */
export const createCheckoutSession = action({
  args: {
    priceId: v.string(),
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
    let user = await ctx.runQuery(internal.stripeInternal.getUserByClerkId, {
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

    // Periode bestimmen
    const isYearly = args.priceId === PRICE_IDS.pro_yearly;

    // Checkout Session erstellen
    const session = await getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: args.priceId,
          quantity: 1,
        },
      ],
      metadata: {
        clerkId,
        priceId: args.priceId,
      },
      subscription_data: {
        metadata: {
          clerkId,
          priceId: args.priceId,
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
        const priceId = session.metadata?.priceId;

        if (!clerkId || !priceId) {
          console.error("Missing metadata in checkout session");
          return;
        }

        let subscription: "pro_monthly" | "pro_yearly";
        let periodEnd: number;

        if (priceId === PRICE_IDS.pro_yearly) {
          subscription = "pro_yearly";
          periodEnd = Date.now() + (365 * 24 * 60 * 60 * 1000); // +1 Jahr
        } else {
          subscription = "pro_monthly";
          periodEnd = Date.now() + (30 * 24 * 60 * 60 * 1000); // +1 Monat
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
      // SUBSCRIPTION UPDATED - Statusänderung
      // ============================================================
      case "customer.subscription.updated": {
        const subscription = args.data as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        // Wurde cancel_at_period_end gesetzt? (User hat gekündigt)
        if (subscription.cancel_at_period_end) {
          const periodEnd = subscription.current_period_end * 1000;

          await ctx.runMutation(internal.users.markForDowngradeByStripeCustomer, {
            stripeCustomerId,
            subscriptionEndDate: periodEnd,
          });

          console.log(`[Stripe] Customer ${stripeCustomerId} marked for downgrade at ${new Date(periodEnd).toISOString()}`);
        }
        break;
      }

      // ============================================================
      // SUBSCRIPTION DELETED - Subscription abgelaufen
      // ============================================================
      case "customer.subscription.deleted": {
        const subscription = args.data as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        // User laden
        const user = await ctx.runQuery(internal.stripeInternal.getUserByStripeCustomerId, {
          stripeCustomerId,
        });

        if (!user) {
          console.error(`User with stripeCustomerId ${stripeCustomerId} not found`);
          return;
        }

        // ============================================================
        // DOWNGRADE: Pro -> Free
        // ============================================================
        // 1. Subscription ändern
        await ctx.runMutation(internal.users.updateSubscriptionByStripeCustomer, {
          stripeCustomerId,
          subscription: "free",
          subscriptionStatus: "canceled",
          subscriptionEndDate: undefined,
          subscriptionStartDate: undefined,
          stripeSubscriptionId: undefined,
        });

        // 2. Counter resetten (nur wenn markiert)
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

      default:
        console.log(`Unhandled Stripe event: ${args.eventType}`);
    }
  },
});
