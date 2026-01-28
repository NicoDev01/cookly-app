import { defineApp } from "convex/config";

export default defineApp({
  auth: {
    // Clerk JWT configuration
    // The issuer URL is used to verify JWT tokens from Clerk
    // Set CLERK_JWT_ISSUER_DOMAIN env var in Convex dashboard
    providers: [
      {
        // Use the issuer URL from Clerk
        domain: process.env.CLERK_JWT_ISSUER_DOMAIN || "https://joint-mollusk-58.clerk.accounts.dev",
      }
    ]
  }
});
