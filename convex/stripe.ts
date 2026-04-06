import { action, internalAction, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import Stripe from "stripe";
import { getAuthUserId } from "@convex-dev/auth/server";

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

function formatEuroFromCents(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export const getPlanPricing = query({
  args: {},
  handler: async () => {
    const monthly = PLAN_PRICES.pro_monthly.unit_amount;
    const yearly = PLAN_PRICES.pro_yearly.unit_amount;

    return {
      pro_monthly: {
        planId: "pro_monthly" as const,
        unitAmount: monthly,
        currency: PLAN_PRICES.pro_monthly.currency,
        interval: PLAN_PRICES.pro_monthly.interval,
        displayPrice: formatEuroFromCents(monthly),
        displayPeriod: "Monat" as const,
        billingLabel: `Monatliche Abrechnung (Gesamt ${formatEuroFromCents(monthly * 12)}/Jahr)`,
      },
      pro_yearly: {
        planId: "pro_yearly" as const,
        unitAmount: yearly,
        currency: PLAN_PRICES.pro_yearly.currency,
        interval: PLAN_PRICES.pro_yearly.interval,
        displayPrice: formatEuroFromCents(yearly),
        displayPeriod: "Jahr" as const,
        billingLabel: `Jährliche Abrechnung (Gesamt ${formatEuroFromCents(yearly)})`,
      },
    };
  },
});

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

type InternalSubscriptionPlan = "pro_monthly" | "pro_yearly";
type InternalSubscriptionStatus = "active" | "canceled" | "past_due";
const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
]);

function toCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function toSubscriptionId(
  subscription: string | Stripe.Subscription | null | undefined
): string | null {
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

function mapStripeStatusToInternal(status: string | null | undefined): InternalSubscriptionStatus {
  if (!status) return "past_due";
  if (status === "active" || status === "trialing") return "active";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "past_due";
}

function mapPlanFromSubscription(
  subscription: Stripe.Subscription,
  fallbackPlanId?: PlanId
): InternalSubscriptionPlan {
  const metadataPlanId = subscription.metadata?.planId as PlanId | undefined;
  if (metadataPlanId === "pro_yearly") return "pro_yearly";
  if (metadataPlanId === "pro_monthly") return "pro_monthly";

  const firstItem = subscription.items?.data?.[0];
  const interval = firstItem?.price?.recurring?.interval;
  if (interval === "year") return "pro_yearly";
  if (interval === "month") return "pro_monthly";

  if (fallbackPlanId === "pro_yearly") return "pro_yearly";
  return "pro_monthly";
}

function toMs(value: unknown): number | undefined {
  return typeof value === "number" ? value * 1000 : undefined;
}

function getSubscriptionPeriods(subscription: Stripe.Subscription): {
  start: number | undefined;
  end: number | undefined;
} {
  const firstItem = subscription.items?.data?.[0] as
    | { current_period_start?: number; current_period_end?: number }
    | undefined;
  const subscriptionLike = subscription as {
    current_period_start?: number;
    current_period_end?: number;
  };

  return {
    start: toMs(firstItem?.current_period_start ?? subscriptionLike.current_period_start),
    end: toMs(firstItem?.current_period_end ?? subscriptionLike.current_period_end),
  };
}

function getBlockingSubscription(
  subscriptions: Stripe.Subscription[]
): Stripe.Subscription | undefined {
  return subscriptions.find((subscription) =>
    BLOCKING_SUBSCRIPTION_STATUSES.has(subscription.status)
  );
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
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("Not authenticated");
    }

    // User laden und Stripe Customer ID holen/erstellen
    const user = await ctx.runQuery(internal.stripeInternal.getUserByAuthUserId, {
      authUserId: authUserId.toString(),
    });
    if (!user?._id) {
      throw new Error("User profile not found. Please sign in again.");
    }

    let stripeCustomerId = user?.stripeCustomerId;

    // Falls keine Customer ID existiert, neue erstellen
    if (!stripeCustomerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        name: user.name,
        metadata: { convexUserId: user?._id ?? "" },
      });
      stripeCustomerId = customer.id;

      // Speichern in Convex
      await ctx.runMutation(internal.users.updateSubscriptionByConvexUserId, {
        convexUserId: user._id,
        stripeCustomerId,
        subscription: user?.subscription || "free",
        subscriptionStatus: user?.subscriptionStatus || "active",
      });
    }

    // Schutz gegen doppelte Abos: vorhandene aktive/trialing/past_due/etc. Subscriptions blockieren.
    const existingSubscriptions = await getStripe().subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 20,
    });
    const blockingSubscription = getBlockingSubscription(existingSubscriptions.data);
    if (blockingSubscription) {
      throw new Error(
        `Subscription already exists (${blockingSubscription.status}). Please use the billing portal to manage your plan.`
      );
    }

    const plan = PLAN_PRICES[args.planId];
    // Inline-Preise als Single Source of Truth (Backend -> Frontend -> Stripe Checkout).
    const session = await getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
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
        convexUserId: user._id,
        planId: args.planId,
      },
      subscription_data: {
        metadata: {
          convexUserId: user._id,
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
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.runQuery(internal.stripeInternal.getUserByAuthUserId, {
      authUserId: authUserId.toString(),
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
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.runQuery(internal.stripeInternal.getUserByAuthUserId, {
      authUserId: authUserId.toString(),
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
      userId: user._id,
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
    const syncFromStripeSubscriptionId = async (
      stripeSubscriptionId: string,
      fallbackPlanId?: PlanId
    ) => {
      const latestSubscription = await getStripe().subscriptions.retrieve(stripeSubscriptionId);
      const stripeCustomerId = toCustomerId(latestSubscription.customer);
      if (!stripeCustomerId) {
        throw new Error(`[Stripe] Missing customer on subscription ${latestSubscription.id}`);
      }

      const subscription = mapPlanFromSubscription(latestSubscription, fallbackPlanId);
      const subscriptionStatus = mapStripeStatusToInternal(latestSubscription.status);
      const periods = getSubscriptionPeriods(latestSubscription);

      await ctx.runMutation(internal.users.updateSubscriptionByStripeCustomer, {
        stripeCustomerId,
        subscription,
        subscriptionStatus,
        subscriptionStartDate: periods.start,
        subscriptionEndDate: periods.end,
        stripeSubscriptionId: latestSubscription.id,
      });

      if (latestSubscription.cancel_at_period_end && periods.end) {
        await ctx.runMutation(internal.users.markForDowngradeByStripeCustomer, {
          stripeCustomerId,
          subscriptionEndDate: periods.end,
        });
      } else {
        await ctx.runMutation(internal.users.clearDowngradeMarkByStripeCustomer, {
          stripeCustomerId,
        });
      }

      return {
        stripeCustomerId,
        stripeSubscriptionId: latestSubscription.id,
        subscription,
        subscriptionStatus,
        subscriptionStartDate: periods.start,
        subscriptionEndDate: periods.end,
      };
    };

    switch (args.eventType) {
      // ============================================================
      // CHECKOUT COMPLETED - Neue Subscription
      // ============================================================
      case "checkout.session.completed": {
        const session = args.data as Stripe.Checkout.Session;
        const convexUserId = session.metadata?.convexUserId;
        const planId = session.metadata?.planId as PlanId | undefined;
        const stripeSubscriptionId = toSubscriptionId(session.subscription);
        const stripeCustomerIdFromSession = toCustomerId(session.customer);

        let resolved = {
          stripeCustomerId: stripeCustomerIdFromSession,
          stripeSubscriptionId: stripeSubscriptionId,
          subscription: (planId === "pro_yearly" ? "pro_yearly" : "pro_monthly") as InternalSubscriptionPlan,
          subscriptionStatus: "active" as InternalSubscriptionStatus,
          subscriptionStartDate: Date.now(),
          subscriptionEndDate:
            Date.now() +
            (planId === "pro_yearly" ? 365 : 30) * 24 * 60 * 60 * 1000,
        };

        if (stripeSubscriptionId) {
          try {
            const synced = await syncFromStripeSubscriptionId(stripeSubscriptionId, planId);
            resolved = synced;
          } catch (err) {
            console.error("[Stripe] Failed to sync latest subscription after checkout:", err);
          }
        }

        if (convexUserId) {
          await ctx.runMutation(internal.users.updateSubscriptionByConvexUserId, {
            convexUserId,
            subscription: resolved.subscription,
            subscriptionStatus: resolved.subscriptionStatus,
            subscriptionStartDate: resolved.subscriptionStartDate,
            subscriptionEndDate: resolved.subscriptionEndDate,
            stripeSubscriptionId: resolved.stripeSubscriptionId ?? undefined,
            stripeCustomerId: resolved.stripeCustomerId ?? undefined,
          });
        } else if (resolved.stripeCustomerId) {
          await ctx.runMutation(internal.users.updateSubscriptionByStripeCustomer, {
            stripeCustomerId: resolved.stripeCustomerId,
            subscription: resolved.subscription,
            subscriptionStatus: resolved.subscriptionStatus,
            subscriptionStartDate: resolved.subscriptionStartDate,
            subscriptionEndDate: resolved.subscriptionEndDate,
            stripeSubscriptionId: resolved.stripeSubscriptionId ?? undefined,
          });
        } else {
          console.error("[Stripe] Missing both convexUserId and stripeCustomerId on checkout.session.completed");
          return;
        }

        if (resolved.subscriptionEndDate) {
          console.log(
            `[Stripe] Checkout completed (${resolved.subscription}) until ${new Date(
              resolved.subscriptionEndDate
            ).toISOString()}`
          );
        }
        break;
      }

      // ============================================================
      // SUBSCRIPTION UPDATED - Statusänderung / Renewal
      // ============================================================
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subUpdated = args.data as Stripe.Subscription;
        const stripeCustomerId = toCustomerId(subUpdated.customer);
        if (!stripeCustomerId) {
          console.error("[Stripe] Missing stripeCustomerId on subscription event");
          return;
        }

        const periods = getSubscriptionPeriods(subUpdated);
        const subscription = mapPlanFromSubscription(subUpdated);
        const subscriptionStatus = mapStripeStatusToInternal(subUpdated.status);

        await ctx.runMutation(internal.users.updateSubscriptionByStripeCustomer, {
          stripeCustomerId,
          subscription,
          subscriptionStatus,
          subscriptionStartDate: periods.start,
          subscriptionEndDate: periods.end,
          stripeSubscriptionId: subUpdated.id,
        });

        if (subUpdated.cancel_at_period_end && periods.end) {
          await ctx.runMutation(internal.users.markForDowngradeByStripeCustomer, {
            stripeCustomerId,
            subscriptionEndDate: periods.end,
          });
          console.log(
            `[Stripe] Customer ${stripeCustomerId} marked for downgrade at ${new Date(
              periods.end
            ).toISOString()}`
          );
        } else {
          await ctx.runMutation(internal.users.clearDowngradeMarkByStripeCustomer, {
            stripeCustomerId,
          });
        }

        break;
      }

      // ============================================================
      // SUBSCRIPTION DELETED - Subscription abgelaufen/gekündigt
      // ============================================================
      case "customer.subscription.deleted": {
        const subscription = args.data as Stripe.Subscription;
        const stripeCustomerId = toCustomerId(subscription.customer);
        if (!stripeCustomerId) {
          console.error("[Stripe] Missing stripeCustomerId on customer.subscription.deleted");
          return;
        }

        // User laden
        const user = await ctx.runQuery(internal.stripeInternal.getUserByStripeCustomerId, {
          stripeCustomerId,
        });

        if (!user) {
          console.error(`[Stripe] User with stripeCustomerId ${stripeCustomerId} not found`);
          return;
        }

        // DOWNGRADE: Pro -> Free
        await ctx.runMutation(internal.users.downgradeToFreeByStripeCustomer, {
          stripeCustomerId,
        });

        // Counter resetten (nur wenn markiert)
        if (user.usageStats?.resetOnDowngrade) {
          await ctx.runMutation(internal.users.resetUsageCounters, {
            userId: user._id,
          });
        }

        console.log(`[Stripe] User ${user._id} downgraded to Free. Counters reset: ${user.usageStats?.resetOnDowngrade}`);
        break;
      }

      // ============================================================
      // INVOICE PAYMENT FAILED - Zahlung fehlgeschlagen
      // ============================================================
      case "invoice.payment_failed": {
        const invoice = args.data as Stripe.Invoice;
        const stripeSubscriptionId = toSubscriptionId(
          invoice.subscription as string | Stripe.Subscription | null | undefined
        );
        if (stripeSubscriptionId) {
          try {
            await syncFromStripeSubscriptionId(stripeSubscriptionId);
            break;
          } catch (err) {
            console.error("[Stripe] Failed to sync subscription after payment_failed:", err);
          }
        }

        const stripeCustomerId = toCustomerId(invoice.customer);
        if (stripeCustomerId) {
          await ctx.runMutation(internal.users.updateSubscriptionStatusByStripeCustomer, {
            stripeCustomerId,
            subscriptionStatus: "past_due",
          });
          console.log(`[Stripe] Payment failed for customer ${stripeCustomerId}`);
        }
        break;
      }

      // ============================================================
      // INVOICE PAYMENT SUCCEEDED - Zahlung erfolgreich (Renewal)
      // ============================================================
      case "invoice.payment_succeeded": {
        const invoice = args.data as Stripe.Invoice;
        const stripeSubscriptionId = toSubscriptionId(
          invoice.subscription as string | Stripe.Subscription | null | undefined
        );
        if (stripeSubscriptionId) {
          try {
            await syncFromStripeSubscriptionId(stripeSubscriptionId);
            break;
          } catch (err) {
            console.error("[Stripe] Failed to sync subscription after payment_succeeded:", err);
          }
        }

        const stripeCustomerId = toCustomerId(invoice.customer);
        if (stripeCustomerId) {
          await ctx.runMutation(internal.users.updateSubscriptionStatusByStripeCustomer, {
            stripeCustomerId,
            subscriptionStatus: "active",
          });
          console.log(`[Stripe] Payment succeeded for customer ${stripeCustomerId}`);
        }
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event: ${args.eventType}`);
    }
  },
});
