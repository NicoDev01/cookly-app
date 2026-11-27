import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { Apple } from "./appleAuth";
import { duplicateEmailCandidates } from "./lib/authEmail";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Google, Apple],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId, provider, profile }) {
      // Verhindert ein zweites Konto per Passwort-Registrierung, wenn die E-Mail
      // bereits über Google, Apple oder Passwort existiert (rollt die Mutation atomar zurück).
      if (provider.id !== "password" || existingUserId !== null || typeof profile.email !== "string") {
        return;
      }
      const db = ctx.db as MutationCtx["db"];
      for (const candidate of duplicateEmailCandidates(profile.email)) {
        const matches = await db
          .query("users")
          .withIndex("email", (q) => q.eq("email", candidate))
          .take(2);
        if (matches.some((user) => user._id !== userId)) {
          throw new ConvexError("Account already exists");
        }
      }
    },
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
