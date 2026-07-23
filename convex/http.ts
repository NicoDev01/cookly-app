import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";
import { auth } from "./auth";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();
let stripeWebhookClient: Stripe | null = null;
const STRIPE_WEBHOOK_RETENTION_DAYS = 45;
const STRIPE_WEBHOOK_CLEANUP_BATCH_SIZE = 100;
const BILLING_WEBHOOK_RETENTION_MS = 45 * 24 * 60 * 60 * 1000;

const adminAuthorized = (request: Request) => {
  const expected = process.env.COOKLY_ADMIN_TOKEN;
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

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
      const cleanupArgs = {
        olderThanMs:
          Date.now() - STRIPE_WEBHOOK_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        batchSize: STRIPE_WEBHOOK_CLEANUP_BATCH_SIZE,
      };

      const isNewEvent = await ctx.runMutation(internal.stripeInternal.recordWebhookEventIfNew, {
        eventId: event.id,
        eventType: event.type,
      });
      if (!isNewEvent) {
        await ctx.runMutation(internal.stripeInternal.cleanupOldWebhookEvents, cleanupArgs);
        return new Response("Webhook already processed", { status: 200 });
      }
      
      await ctx.runAction(internal.stripe.handleWebhookEvent, {
        eventType: event.type,
        data: event.data.object,
      });
      await ctx.runMutation(internal.growth.recordStripeEvent, {
        eventId: event.id,
        eventType: event.type,
        data: event.data.object,
      });
      await ctx.runMutation(internal.stripeInternal.cleanupOldWebhookEvents, cleanupArgs);

      return new Response("Webhook processed", { status: 200 });
    } catch (error) {
      try {
        await ctx.runMutation(internal.stripeInternal.clearWebhookEventRecord, { eventId: event.id });
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

http.route({
  path: "/admin/snapshot",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    return json(await ctx.runQuery(internal.admin.snapshot));
  }),
});

http.route({
  path: "/admin/users",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    const search = new URL(request.url).searchParams.get("search") || undefined;
    return json(await ctx.runQuery(internal.admin.users, { search }));
  }),
});

http.route({
  path: "/admin/user",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    const billingUserId = new URL(request.url).searchParams.get("billingUserId");
    if (!billingUserId) return json({ error: "billingUserId required" }, 400);
    return json(await ctx.runQuery(internal.admin.userDetail, { billingUserId }));
  }),
});

http.route({
  path: "/admin/campaigns",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    return json(await ctx.runQuery(internal.marketing.listAdmin));
  }),
});

http.route({
  path: "/admin/campaigns",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    try {
      return json({ id: await ctx.runMutation(internal.marketing.createAdmin, await request.json()) }, 201);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid campaign" }, 400);
    }
  }),
});

http.route({
  path: "/admin/campaigns/status",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    try {
      await ctx.runMutation(internal.marketing.setStatusAdmin, await request.json());
      return json({ ok: true });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid status" }, 400);
    }
  }),
});

http.route({
  path: "/admin/experiments",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    return json(await ctx.runQuery(internal.experiments.listAdmin));
  }),
});

http.route({
  path: "/admin/experiments",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    try {
      return json({ id: await ctx.runMutation(internal.experiments.createAdmin, await request.json()) }, 201);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid experiment" }, 400);
    }
  }),
});

http.route({
  path: "/admin/experiments/status",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    try {
      await ctx.runMutation(internal.experiments.setStatusAdmin, await request.json());
      return json({ ok: true });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid experiment status" }, 400);
    }
  }),
});

http.route({
  path: "/admin/marketing-spend",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    try {
      return json({ id: await ctx.runMutation(internal.marketing.addSpendAdmin, await request.json()) }, 201);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid spend" }, 400);
    }
  }),
});

http.route({
  path: "/admin/costs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    try {
      return json({ id: await ctx.runMutation(internal.admin.addCost, await request.json()) }, 201);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid cost" }, 400);
    }
  }),
});

http.route({
  path: "/brevo/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.BREVO_WEBHOOK_SECRET;
    if (!secret || request.headers.get("x-cookly-webhook-secret") !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
    const payload = await request.json() as Record<string, unknown>;
    const occurredAt = typeof payload.ts_event === "number" ? payload.ts_event * 1_000 : Date.now();
    await ctx.runMutation(internal.analytics.recordInternal, {
      eventId: `brevo:${String(payload["message-id"] ?? crypto.randomUUID())}:${String(payload.event ?? "unknown")}`,
      name: `email_${String(payload.event ?? "unknown").replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`,
      version: 1,
      billingUserId: typeof payload.COOKLY_USER_ID === "string" ? payload.COOKLY_USER_ID : undefined,
      platform: "server",
      properties: payload,
      occurredAt,
    });
    const tags = Array.isArray(payload.tags) ? payload.tags : [];
    const campaignId = tags.find((tag): tag is string => typeof tag === "string");
    const billingUserId = typeof payload.COOKLY_USER_ID === "string" ? payload.COOKLY_USER_ID : undefined;
    const email = typeof payload.email === "string" ? payload.email : undefined;
    const event = String(payload.event ?? "").toLowerCase();
    if (campaignId && (billingUserId || email) && ["delivered", "opened", "click"].includes(event)) {
      await ctx.runMutation(internal.marketing.recordExternalDelivery, {
        campaignId: campaignId as Id<"campaigns">,
        billingUserId,
        email,
        event: event === "click" ? "clicked" : "impression",
      });
    }
    return json({ ok: true });
  }),
});

// Backward-compatible legacy path
http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: stripeWebhookHandler,
});

http.route({
  path: "/revenuecat/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!secret) return new Response("Webhook not configured", { status: 503 });
    if (request.headers.get("authorization") !== secret) return new Response("Unauthorized", { status: 401 });

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid payload", { status: 400 });
    }

    try {
      await ctx.runMutation(internal.billing.processRevenueCatWebhook, { payload });
      await ctx.runMutation(internal.growth.recordRevenueCatEvent, { payload });
      await ctx.runMutation(internal.billing.cleanupWebhookEvents, {
        olderThanMs: Date.now() - BILLING_WEBHOOK_RETENTION_MS,
      });
      return new Response("Webhook processed", { status: 200 });
    } catch (error) {
      console.error("RevenueCat webhook processing failed", error);
      return new Response("Webhook processing failed", { status: 500 });
    }
  }),
});

http.route({
  path: "/admin/backfill",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!adminAuthorized(request)) return new Response("Unauthorized", { status: 401 });
    const payload = await request.json().catch(() => ({})) as { cursor?: string };
    return json(await ctx.runMutation(internal.growth.backfillUsers, payload));
  }),
});

export default http;
