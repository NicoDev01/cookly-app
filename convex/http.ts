import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import Stripe from "stripe";
import { auth } from "./auth";
import { clearWebhookEventRecord, recordWebhookEventIfNew } from "./stripeInternal";

const http = httpRouter();
let stripeWebhookClient: Stripe | null = null;

function getStripeWebhookClient(): Stripe {
  if (!stripeWebhookClient) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY not set");
    }
    stripeWebhookClient = new Stripe(stripeSecretKey, {
      apiVersion: "2025-12-15.clover",
    });
  }
  return stripeWebhookClient;
}

// Convex Auth HTTP routes (OAuth callbacks, token exchange)
auth.addHttpRoutes(http);

// Stripe webhook handler
const stripeWebhookHandler = httpAction(async (ctx, request) => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY not set");
      return new Response("Stripe secret key not configured", { status: 500 });
    }

    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeWebhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    const payload = await request.text();

    let event: Stripe.Event;
    try {
      event = getStripeWebhookClient().webhooks.constructEvent(
        payload,
        signature,
        stripeWebhookSecret
      );
    } catch (err) {
      console.error("Stripe webhook verification failed:", err);
      return new Response("Invalid payload", { status: 400 });
    }

    if (!event?.id || !event?.type) {
      return new Response("Invalid event payload", { status: 400 });
    }

    try {
      const isNewEvent = await ctx.runMutation(recordWebhookEventIfNew, {
        eventId: event.id,
        eventType: event.type,
      });
      if (!isNewEvent) {
        return new Response("Webhook already processed", { status: 200 });
      }

      const { internal } = await import("./_generated/api");
      
      await ctx.runAction(internal.stripe.handleWebhookEvent, {
        eventType: event.type,
        data: event.data.object,
      });

      return new Response("Webhook processed", { status: 200 });
    } catch (error) {
      try {
        await ctx.runMutation(clearWebhookEventRecord, { eventId: event.id });
      } catch {
        // ignore rollback cleanup errors
      }
      console.error("Error processing Stripe webhook:", error);
      return new Response("Error processing webhook", { status: 500 });
    }
  });

// Preferred path (docs-compatible)
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: stripeWebhookHandler,
});

// Backward-compatible legacy path
http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: stripeWebhookHandler,
});

export default http;
