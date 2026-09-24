import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";

// Native Sign in with Apple (iOS): Die App liefert das identityToken aus
// ASAuthorizationController, wir verifizieren es gegen Apples JWKS.
// Env: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (.p8-Inhalt), optional APPLE_BUNDLE_ID.
const APPLE_ISSUER = "https://appleid.apple.com";
const appleKeys = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));
const bundleId = () => process.env.APPLE_BUNDLE_ID ?? "com.cookly.recipe";

const optionalString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const Apple = ConvexCredentials<DataModel>({
  id: "apple",
  authorize: async (credentials, ctx) => {
    const idToken = optionalString(credentials.idToken);
    const nonce = optionalString(credentials.nonce);
    if (!idToken || !nonce) throw new Error("INVALID_APPLE_CREDENTIALS");

    const { payload } = await jwtVerify(idToken, appleKeys, {
      issuer: APPLE_ISSUER,
      audience: bundleId(),
    });
    if (payload.nonce !== nonce || !payload.sub) throw new Error("INVALID_APPLE_CREDENTIALS");

    const email = optionalString(payload.email);
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";
    // Apple liefert den Namen nur beim allerersten Login – danach nicht überschreiben.
    const name = [optionalString(credentials.givenName), optionalString(credentials.familyName)]
      .filter(Boolean)
      .join(" ") || undefined;

    const { user } = await createAccount(ctx, {
      provider: "apple",
      account: { id: payload.sub },
      profile: {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        emailVerified,
      } as Parameters<typeof createAccount<DataModel>>[1]["profile"],
      shouldLinkViaEmail: emailVerified,
    });

    const authorizationCode = optionalString(credentials.authorizationCode);
    if (authorizationCode) {
      await ctx.scheduler.runAfter(0, internal.appleAuth.storeRefreshToken, {
        userId: user._id,
        authorizationCode,
      });
    }

    return { userId: user._id };
  },
});

async function clientSecret() {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!teamId || !keyId || !privateKey) throw new Error("APPLE_ENV_MISSING");

  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(bundleId())
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(await importPKCS8(privateKey, "ES256"));
}

async function appleRequest(path: "token" | "revoke", params: Record<string, string>) {
  const response = await fetch(`${APPLE_ISSUER}/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: bundleId(), client_secret: await clientSecret(), ...params }),
  });
  if (!response.ok) throw new Error(`APPLE_${path.toUpperCase()}_FAILED_${response.status}`);
  return response;
}

// Der Refresh-Token wird nur gebraucht, um ihn bei Kontolöschung zu widerrufen (App Store 5.1.1(v)).
export const storeRefreshToken = internalAction({
  args: { userId: v.id("users"), authorizationCode: v.string() },
  handler: async (ctx, { userId, authorizationCode }) => {
    try {
      const response = await appleRequest("token", {
        grant_type: "authorization_code",
        code: authorizationCode,
      });
      const { refresh_token: refreshToken } = (await response.json()) as { refresh_token?: string };
      if (refreshToken) await ctx.runMutation(internal.appleAuth.saveRefreshToken, { userId, refreshToken });
    } catch (error) {
      console.warn("[appleAuth] token exchange failed", error instanceof Error ? error.message : error);
    }
  },
});

export const saveRefreshToken = internalMutation({
  args: { userId: v.id("users"), refreshToken: v.string() },
  handler: async (ctx, { userId, refreshToken }) => {
    if (!(await ctx.db.get(userId))) return;
    const existing = await ctx.db.query("appleSignInTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) await ctx.db.patch(existing._id, { refreshToken, updatedAt: Date.now() });
    else await ctx.db.insert("appleSignInTokens", { userId, refreshToken, updatedAt: Date.now() });
  },
});

export const getRefreshTokens = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    (await ctx.db.query("appleSignInTokens").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
      .map((row) => row.refreshToken),
});

export async function revokeAppleTokens(ctx: ActionCtx, userId: Id<"users">) {
  for (const token of await ctx.runQuery(internal.appleAuth.getRefreshTokens, { userId })) {
    await appleRequest("revoke", { token, token_type_hint: "refresh_token" });
  }
}
