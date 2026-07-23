import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { EVENT_NAMES } from "../analytics/eventRegistry";

const eventName = v.string();
const registeredEvents = new Set<string>(EVENT_NAMES);

type EventInput = {
  eventId: string;
  name: string;
  version: number;
  userId?: Id<"users">;
  billingUserId?: string;
  anonymousId?: string;
  sessionId?: string;
  correlationId?: string;
  operationId?: string;
  platform?: string;
  appVersion?: string;
  screen?: string;
  properties?: unknown;
  occurredAt: number;
};

const dayOf = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export async function storeAnalyticsEvent(ctx: MutationCtx, event: EventInput) {
  const duplicate = await ctx.db
    .query("analyticsEvents")
    .withIndex("by_eventId", (q) => q.eq("eventId", event.eventId))
    .unique();
  if (duplicate) return false;

  await ctx.db.insert("analyticsEvents", { ...event, receivedAt: Date.now() });
  const day = dayOf(event.occurredAt);
  const metric = await ctx.db
    .query("dailyMetrics")
    .withIndex("by_day_metric", (q) => q.eq("day", day).eq("metric", event.name))
    .filter((q) => q.eq(q.field("dimension"), event.platform))
    .first();
  if (metric) {
    await ctx.db.patch(metric._id, { value: metric.value + 1, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("dailyMetrics", {
      day,
      metric: event.name,
      dimension: event.platform,
      value: 1,
      updatedAt: Date.now(),
    });
  }
  return true;
}

export const record = mutation({
  args: {
    eventId: v.string(),
    name: eventName,
    version: v.number(),
    anonymousId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    operationId: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    screen: v.optional(v.string()),
    properties: v.optional(v.any()),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (!registeredEvents.has(args.name)) throw new Error("UNKNOWN_ANALYTICS_EVENT");
    const authUserId = await getAuthUserId(ctx);
    let userId: Id<"users"> | undefined;
    let billingUserId: string | undefined;
    if (authUserId) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
        .first();
      userId = user?._id;
      billingUserId = user?.billingUserId;
    }
    return storeAnalyticsEvent(ctx, { ...args, userId, billingUserId });
  },
});

export const recordInternal = internalMutation({
  args: {
    eventId: v.string(),
    name: eventName,
    version: v.number(),
    userId: v.optional(v.id("users")),
    billingUserId: v.optional(v.string()),
    anonymousId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    operationId: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    screen: v.optional(v.string()),
    properties: v.optional(v.any()),
    occurredAt: v.number(),
  },
  handler: storeAnalyticsEvent,
});

export const syntheticCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    return storeAnalyticsEvent(ctx, {
      eventId: `synthetic:${dayOf(now)}`,
      name: "synthetic_health_check",
      version: 1,
      platform: "server",
      properties: { expected: true },
      occurredAt: now,
    });
  },
});

export const dataQuality = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_receivedAt", (q) => q.gte("receivedAt", args.since))
      .take(5_000);
    const missingContext = rows.filter((row) => !row.platform || !row.version).length;
    const delayed = rows.filter((row) => row.receivedAt - row.occurredAt > 60_000).length;
    const ids = new Set(rows.map((row) => row.eventId));
    return {
      events: rows.length,
      missingContext,
      delayed,
      duplicateRate: rows.length ? 1 - ids.size / rows.length : 0,
      lastReceivedAt: Math.max(0, ...rows.map((row) => row.receivedAt)),
    };
  },
});
