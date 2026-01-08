import { httpAction } from "./_generated/server";
import { api } from "./_generated";

// Clerk webhook handler
export const clerkWebhook = httpAction(async (ctx, request) => {
  // TODO: Implement Clerk webhook verification
  // This will be implemented in Phase 1
  return new Response("Webhook received", { status: 200 });
});

// Stripe webhook handler
export const stripeWebhook = httpAction(async (ctx, request) => {
  // TODO: Implement Stripe webhook handling
  // This will be implemented in Phase 3
  return new Response("Webhook received", { status: 200 });
});
