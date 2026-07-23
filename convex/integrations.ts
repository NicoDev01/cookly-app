import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";

type Provider = "posthog" | "brevo" | "fcm" | "sentry" | "stripe" | "revenuecat";

export async function enqueueIntegration(
  ctx: MutationCtx,
  provider: Provider,
  kind: string,
  dedupeKey: string,
  payload: unknown,
) {
  const existing = await ctx.db
    .query("integrationJobs")
    .withIndex("by_provider_dedupe", (q) => q.eq("provider", provider).eq("dedupeKey", dedupeKey))
    .unique();
  if (existing) return existing._id;
  const now = Date.now();
  return ctx.db.insert("integrationJobs", {
    provider,
    kind,
    dedupeKey,
    payload,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export const due = internalQuery({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query("integrationJobs")
      .withIndex("by_status_nextAttemptAt", (q) => q.eq("status", "pending").lte("nextAttemptAt", Date.now()))
      .take(25),
});

export const claim = internalMutation({
  args: { id: v.id("integrationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job || job.status !== "pending" || job.nextAttemptAt > Date.now()) return null;
    await ctx.db.patch(job._id, {
      status: "running",
      attempts: job.attempts + 1,
      updatedAt: Date.now(),
    });
    return job;
  },
});

export const finish = internalMutation({
  args: { id: v.id("integrationJobs"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) return;
    const failed = Boolean(args.error);
    await ctx.db.patch(job._id, {
      status: failed && job.attempts < 5 ? "pending" : failed ? "failed" : "succeeded",
      lastError: args.error?.slice(0, 300),
      nextAttemptAt: Date.now() + Math.min(3_600_000, 2 ** job.attempts * 30_000),
      updatedAt: Date.now(),
    });
  },
});

const jsonRequest = async (url: string, init: RequestInit) => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`.slice(0, 300));
};

const base64url = (input: string | ArrayBuffer) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const googleAccessToken = async () => {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON not configured");
  const account = JSON.parse(raw) as { client_email: string; private_key: string; token_uri?: string };
  const now = Math.floor(Date.now() / 1_000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3_600,
  }));
  const pem = account.private_key.replace(/-----[^-]+-----|\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (char) => char.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${base64url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error(`FCM auth ${response.status}`);
  return (await response.json() as { access_token: string }).access_token;
};

const deliver = async (provider: Provider, kind: string, payload: unknown) => {
  if (provider === "brevo") {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error("BREVO_API_KEY not configured");
    const path = kind === "contact" ? "contacts" : kind === "email_campaign" ? "smtp/email" : "events";
    const body = kind === "email_campaign"
      ? {
          sender: { email: process.env.BREVO_SENDER_EMAIL, name: "Cookly" },
          ...(payload as object),
        }
      : payload;
    if (kind === "email_campaign" && !process.env.BREVO_SENDER_EMAIL) {
      throw new Error("BREVO_SENDER_EMAIL not configured");
    }
    await jsonRequest(`https://api.brevo.com/v3/${path}`, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return;
  }
  if (provider === "posthog") {
    const apiKey = process.env.POSTHOG_PROJECT_KEY;
    if (!apiKey) throw new Error("POSTHOG_PROJECT_KEY not configured");
    const { personProperties, ...event } = payload as {
      personProperties?: Record<string, unknown>;
      properties?: Record<string, unknown>;
    };
    await jsonRequest(`${process.env.POSTHOG_HOST || "https://eu.i.posthog.com"}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        ...event,
        properties: { ...event.properties, ...(personProperties && { $set: personProperties }) },
      }),
    });
    return;
  }
  if (provider === "fcm") {
    const projectId = process.env.FCM_PROJECT_ID;
    if (!projectId) throw new Error("FCM_PROJECT_ID not configured");
    const token = await googleAccessToken();
    await jsonRequest(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ message: payload }),
    });
  }
};

export const processJobs = internalAction({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.runQuery(internal.integrations.due);
    for (const item of jobs) {
      const job = await ctx.runMutation(internal.integrations.claim, { id: item._id });
      if (!job) continue;
      try {
        await deliver(job.provider, job.kind, job.payload);
        await ctx.runMutation(internal.integrations.finish, { id: job._id });
      } catch (error) {
        await ctx.runMutation(internal.integrations.finish, {
          id: job._id,
          error: error instanceof Error ? error.message : "Integration failed",
        });
      }
    }
  },
});
