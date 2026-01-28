import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";

const http = httpRouter();

// Clerk webhook handler
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    console.log("[Clerk Webhook] 🔔 Received webhook request");

    // 1. Verify webhook signature using SVIX (Clerk uses SVIX for webhooks)
    const clerkWebhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!clerkWebhookSecret) {
      console.error("[Clerk Webhook] ❌ CLERK_WEBHOOK_SECRET not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    // Get headers for signature verification
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.log("[Clerk Webhook] ⚠️ Missing svix headers", { svixId, svixTimestamp, hasSignature: !!svixSignature });
      return new Response("Missing svix headers", { status: 400 });
    }

    console.log("[Clerk Webhook] ✅ Svix headers present");

    // 2. Get webhook body
    const payload = await request.text();
    const wh = new Webhook(clerkWebhookSecret);

    let evt: any;
    try {
      // Verify signature
      evt = wh.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
      console.log("[Clerk Webhook] ✅ Signature verified");
    } catch (err) {
      console.error("[Clerk Webhook] ❌ Webhook verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    // 3. Handle webhook events
    const eventType = evt.type;
    const data = evt.data;

    console.log(`[Clerk Webhook] 📦 Event type: ${eventType}, ID: ${data.id}`);

    try {
      switch (eventType) {
        case "user.created":
        case "user.updated": {
          // Sync user data to Convex - use internal mutation
          const clerkId = data.id;
          const email = data.email_addresses?.[0]?.email_address;
          const name = data.first_name && data.last_name
            ? `${data.first_name} ${data.last_name}`
            : data.username || email?.split("@")[0] || "User";
          const avatar = data.image_url;

          console.log(`[Clerk Webhook] 👤 Syncing user: ${clerkId}, Email: ${email}`);

          // Use internal mutation instead of public
          await ctx.runMutation(internal.users.createOrUpdateUserFromWebhook, {
            clerkId,
            email,
            name,
            avatar,
          });

          console.log(`[Clerk Webhook] ✅ User ${clerkId} synced to Convex successfully`);
          break;
        }

        case "user.deleted": {
          // Delete all user data from Convex (GDPR compliant)
          const clerkId = data.id;
          await ctx.runMutation(internal.users.deleteUserFromWebhook, { clerkId });
          console.log(`[Clerk Webhook] 🗑️ User ${clerkId} deleted from Convex`);
          break;
        }

        default:
          console.log(`[Clerk Webhook] ⏭️ Unhandled event type: ${eventType}`);
      }

      return new Response("Webhook processed", { status: 200 });
    } catch (error) {
      console.error("[Clerk Webhook] ❌ Error processing webhook:", error);
      return new Response("Error processing webhook", { status: 500 });
    }
  }),
});

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
