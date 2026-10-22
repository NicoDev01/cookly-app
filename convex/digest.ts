import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { entitlementIsValid } from "./billingModel";
import { type DigestData, berlinTime, isDigestHour, renderDigest } from "./digestModel";
import { PROVIDER_BUDGETS, providerDailyLimit } from "./rateLimiter";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FROM = "Cookly Digest <onboarding@resend.dev>";

// Einmal täglich: begrenzte, indexierte Reads über die letzten 24 Stunden.
export const collect = internalQuery({
  args: { windowEnd: v.number() },
  handler: async (ctx, { windowEnd }): Promise<DigestData> => {
    const windowStart = windowEnd - DAY_MS;
    const inWindow = (timestamp?: number) => timestamp !== undefined && timestamp >= windowStart && timestamp < windowEnd;

    const users = await ctx.db.query("users").take(10_000);

    const entitlements = await ctx.db.query("billingEntitlements").take(10_000);
    const activeByProvider: Record<string, number> = {};
    for (const row of entitlements) {
      if (row.environment !== "production" || !entitlementIsValid(row.status, row.periodEnd, windowEnd)) continue;
      activeByProvider[row.provider] = (activeByProvider[row.provider] ?? 0) + 1;
    }

    const [revenueCatEvents, stripeEvents] = await Promise.all([
      ctx.db.query("revenueCatWebhookEvents").withIndex("by_processedAt", (q) => q.gte("processedAt", windowStart)).take(5_000),
      ctx.db.query("stripeWebhookEvents").withIndex("by_processedAt", (q) => q.gte("processedAt", windowStart)).take(5_000),
    ]);
    const countTypes = (types: string[]) =>
      revenueCatEvents.filter((event) => types.includes(event.eventType)).length +
      stripeEvents.filter((event) => types.includes(event.eventType)).length;

    const importEvents = async (name: string) =>
      ctx.db.query("analyticsEvents")
        .withIndex("by_name_occurredAt", (q) => q.eq("name", name).gte("occurredAt", windowStart).lt("occurredAt", windowEnd))
        .take(5_000);
    const [started, succeeded, failed] = await Promise.all(
      ["import_started", "import_succeeded", "import_failed"].map(importEvents),
    );
    const errorCounts = new Map<string, number>();
    for (const event of failed) {
      const code = (event.properties as { errorCode?: unknown } | undefined)?.errorCode;
      const key = typeof code === "string" ? code : "UNKNOWN";
      errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
    }
    const topError = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    // Provider-Budgets zählen pro UTC-Tag; der letzte vollständige Tag ist aussagekräftig.
    const usageDay = new Date(windowEnd - DAY_MS).toISOString().slice(0, 10);
    const providerUsage = await Promise.all(PROVIDER_BUDGETS.map(async (provider) => {
      const row = await ctx.db.query("providerDailyUsage")
        .withIndex("by_provider_day", (q) => q.eq("provider", provider).eq("day", usageDay))
        .first();
      return { provider, day: usageDay, used: row?.count ?? 0, limit: providerDailyLimit(provider) };
    }));

    const failedJobs = await ctx.db.query("integrationJobs")
      .withIndex("by_status_nextAttemptAt", (q) => q.eq("status", "failed").gte("nextAttemptAt", windowStart))
      .take(1_000);
    const failuresByProvider = new Map<string, { count: number; lastError: string; updatedAt: number }>();
    for (const job of failedJobs) {
      if (!inWindow(job.updatedAt)) continue;
      const current = failuresByProvider.get(job.provider);
      const lastError = job.lastError ?? "unbekannt";
      if (!current) failuresByProvider.set(job.provider, { count: 1, lastError, updatedAt: job.updatedAt });
      else failuresByProvider.set(job.provider, {
        count: current.count + 1,
        ...(job.updatedAt > current.updatedAt ? { lastError, updatedAt: job.updatedAt } : { lastError: current.lastError, updatedAt: current.updatedAt }),
      });
    }

    const failedDeletions = await ctx.db.query("accountDeletionRequests")
      .withIndex("by_status_updatedAt", (q) => q.eq("status", "failed").gte("updatedAt", windowStart))
      .take(100);

    return {
      windowStart,
      windowEnd,
      users: {
        total: users.length,
        new: users.filter((user) => inWindow(user._creationTime)).length,
        active: users.filter((user) => inWindow(user.lastActiveAt)).length,
      },
      subscriptions: {
        activeByProvider,
        purchases: countTypes(["INITIAL_PURCHASE", "checkout.session.completed"]),
        cancellations: countTypes(["CANCELLATION"]),
        expirations: countTypes(["EXPIRATION", "customer.subscription.deleted"]),
      },
      imports: {
        started: started.length,
        succeeded: succeeded.length,
        failed: failed.length,
        topError: topError ? { code: topError[0], count: topError[1] } : undefined,
      },
      providerUsage,
      integrationFailures: [...failuresByProvider.entries()].map(([provider, { count, lastError }]) => ({
        provider,
        count,
        lastError: lastError.slice(0, 200),
      })),
      failedAccountDeletions: failedDeletions.length,
    };
  },
});

// Läuft per Cron um 06:00 und 07:00 UTC; nur der Lauf um 08:00 deutscher Zeit versendet.
export const sendDaily = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }): Promise<"sent" | "skipped" | "not_configured"> => {
    const now = Date.now();
    if (!force && !isDigestHour(now)) return "skipped";

    const apiKey = process.env.RESEND_API_KEY;
    const recipient = process.env.DIGEST_RECIPIENT;
    if (!apiKey || !recipient) {
      console.warn("[digest] RESEND_API_KEY oder DIGEST_RECIPIENT fehlt – Digest nicht versendet");
      return "not_configured";
    }

    const data: DigestData = await ctx.runQuery(internal.digest.collect, { windowEnd: now });
    const { subject, html } = renderDigest(data);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        // Schützt vor Doppelversand bei Cron-Wiederholung; manuelle Läufe sind immer neu.
        "idempotency-key": force ? `cookly-digest/manual/${now}` : `cookly-digest/${berlinTime(now).date}`,
      },
      body: JSON.stringify({
        from: process.env.DIGEST_FROM || DEFAULT_FROM,
        to: recipient.split(",").map((address) => address.trim()).filter(Boolean),
        subject,
        html,
      }),
    });
    if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return "sent";
  },
});

export const sendNow = internalAction({
  args: {},
  handler: async (ctx): Promise<"sent" | "skipped" | "not_configured"> =>
    await ctx.runAction(internal.digest.sendDaily, { force: true }),
});
