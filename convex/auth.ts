import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Google],
  callbacks: {
    async redirect({ redirectTo }) {
      // Erlaube den Capacitor Deep Link Schema für Android OAuth
      if (redirectTo.startsWith("com.cookly.recipe://")) {
        return redirectTo;
      }
      // Standard: relative Pfade und SITE_URL-basierte URLs
      const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") ?? "";
      if (redirectTo.startsWith("/") || redirectTo.startsWith("?")) {
        return `${siteUrl}${redirectTo}`;
      }
      if (redirectTo.startsWith(siteUrl)) {
        return redirectTo;
      }
      return siteUrl;
    },
  },
});
