import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Google],
  callbacks: {
    async redirect({ redirectTo }) {
      // Capacitor Deep Link nur für den expliziten Auth Callback erlauben
      try {
        const deepLink = new URL(redirectTo);
        if (
          deepLink.protocol === "com.cookly.recipe:" &&
          deepLink.hostname === "auth-callback"
        ) {
          return redirectTo;
        }
      } catch {
        // ignore parsing errors for non-URL values
      }

      // Standard: relative Pfade und SITE_URL-basierte URLs
      const siteUrl = process.env.SITE_URL?.replace(/\/$/, "");
      if (!siteUrl) {
        return redirectTo.startsWith("/") || redirectTo.startsWith("?")
          ? redirectTo
          : "/";
      }

      if (redirectTo.startsWith("/") || redirectTo.startsWith("?")) {
        return `${siteUrl}${redirectTo}`;
      }

      try {
        const redirectUrl = new URL(redirectTo);
        const allowedOrigin = new URL(siteUrl).origin;
        if (redirectUrl.origin === allowedOrigin) {
          return redirectTo;
        }
      } catch {
        // invalid absolute URL -> fallback below
      }

      return siteUrl;
    },
  },
});
