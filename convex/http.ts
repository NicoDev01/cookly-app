import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

// Convex Auth HTTP routes (OAuth callbacks, token exchange)
auth.addHttpRoutes(http);

// Stripe webhook handler
http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
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

    let event: { type: string; data: { object: unknown } };
    try {
      const crypto = await import("crypto");
      const signedPayload = `${signature.split(",").find(s => s.startsWith("t="))?.split("=")[1]}.${payload}`;
      const expectedSignature = crypto
        .createHmac("sha256", stripeWebhookSecret)
        .update(signedPayload)
        .digest("hex");
      
      const receivedSignatures = signature
        .split(",")
        .filter(s => s.startsWith("v1="))
        .map(s => s.replace("v1=", ""));
      
      const isValid = receivedSignatures.some(sig => {
        try {
          return crypto.timingSafeEqual(
            Buffer.from(sig, "hex"),
            Buffer.from(expectedSignature, "hex")
          );
        } catch {
          return false;
        }
      });

      if (!isValid) {
        console.error("Invalid Stripe signature");
        return new Response("Invalid signature", { status: 400 });
      }

      event = JSON.parse(payload);
    } catch (err) {
      console.error("Stripe webhook verification failed:", err);
      return new Response("Invalid payload", { status: 400 });
    }

    try {
      const { internal } = await import("./_generated/api");
      
      await ctx.runAction(internal.stripe.handleWebhookEvent, {
        eventType: event.type,
        data: event.data.object,
      });

      return new Response("Webhook processed", { status: 200 });
    } catch (error) {
      console.error("Error processing Stripe webhook:", error);
      return new Response("Error processing webhook", { status: 500 });
    }
  }),
});

export default http;
