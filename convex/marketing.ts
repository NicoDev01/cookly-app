import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { enqueueIntegration } from "./integrations";
import { storeAnalyticsEvent } from "./analytics";

const campaignFields = {
  name: v.string(),
  channel: v.union(v.literal("in_app"), v.literal("push"), v.literal("email")),
  format: v.union(
    v.literal("banner"), v.literal("modal"), v.literal("card"),
    v.literal("paywall"), v.literal("announcement"),
  ),
  status: v.union(
    v.literal("draft"), v.literal("scheduled"), v.literal("active"),
    v.literal("paused"), v.literal("completed"),
  ),
  title: v.string(),
  body: v.string(),
  imageUrl: v.optional(v.string()),
  ctaLabel: v.optional(v.string()),
  ctaDeepLink: v.optional(v.string()),
  audience: v.optional(v.any()),
  placement: v.string(),
  priority: v.number(),
  startAt: v.optional(v.number()),
  endAt: v.optional(v.number()),
  frequencyCap: v.number(),
  experimentKey: v.optional(v.string()),
};

async function currentUser(ctx: QueryCtx) {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;
  return ctx.db
    .query("users")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
    .first();
}

const audienceMatches = (user: Doc<"users">, audience: unknown) => {
  if (!audience || typeof audience !== "object") return true;
  const rules = audience as Record<string, unknown>;
  const values: Record<string, unknown> = {
    plan: user.subscription ?? "free",
    subscriptionStatus: user.subscriptionStatus ?? "active",
    onboardingGoal: user.onboardingGoal,
    lifecycleStage: user.lifecycleStage,
    acquisitionSource: user.acquisitionSource,
  };
  return Object.entries(rules).every(([key, expected]) =>
    !Array.isArray(expected) || expected.length === 0 || expected.includes(values[key]));
};

export const activeCampaign = query({
  args: { placement: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const now = Date.now();
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_status_placement", (q) => q.eq("status", "active").eq("placement", args.placement))
      .collect();
    const eligible = [];
    for (const campaign of campaigns) {
      if ((campaign.startAt && campaign.startAt > now) || (campaign.endAt && campaign.endAt < now)) continue;
      if (!audienceMatches(user, campaign.audience)) continue;
      const delivery = await ctx.db
        .query("campaignDeliveries")
        .withIndex("by_campaign_user", (q) => q.eq("campaignId", campaign._id).eq("userId", user._id))
        .unique();
      if ((delivery?.impressionCount ?? 0) >= campaign.frequencyCap) continue;
      eligible.push(campaign);
    }
    return eligible.sort((a, b) => b.priority - a.priority)[0] ?? null;
  },
});

export const recordDelivery = mutation({
  args: {
    campaignId: v.id("campaigns"),
    event: v.union(v.literal("impression"), v.literal("clicked"), v.literal("dismissed"), v.literal("converted")),
  },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) throw new Error("NOT_AUTHENTICATED");
    const existing = await ctx.db
      .query("campaignDeliveries")
      .withIndex("by_campaign_user", (q) => q.eq("campaignId", args.campaignId).eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (!existing) {
      await ctx.db.insert("campaignDeliveries", {
        campaignId: args.campaignId,
        userId: user._id,
        impressionCount: args.event === "impression" ? 1 : 0,
        lastShownAt: args.event === "impression" ? now : undefined,
        clickedAt: args.event === "clicked" ? now : undefined,
        dismissedAt: args.event === "dismissed" ? now : undefined,
        convertedAt: args.event === "converted" ? now : undefined,
      });
      return;
    }
    await ctx.db.patch(existing._id, {
      impressionCount: existing.impressionCount + (args.event === "impression" ? 1 : 0),
      ...(args.event === "impression" ? { lastShownAt: now } : {}),
      ...(args.event === "clicked" ? { clickedAt: now } : {}),
      ...(args.event === "dismissed" ? { dismissedAt: now } : {}),
      ...(args.event === "converted" ? { convertedAt: now } : {}),
    });
  },
});

export const listAdmin = internalQuery({
  args: {},
  handler: (ctx) => ctx.db.query("campaigns").order("desc").take(200),
});

export const createAdmin = internalMutation({
  args: campaignFields,
  handler: (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("campaigns", { ...args, createdAt: now, updatedAt: now });
  },
});

export const setStatusAdmin = internalMutation({
  args: {
    campaignId: v.id("campaigns"),
    status: v.union(
      v.literal("draft"), v.literal("scheduled"), v.literal("active"),
      v.literal("paused"), v.literal("completed"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId, { status: args.status, updatedAt: Date.now() });
    if (args.status !== "active") return;
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.channel === "in_app") return;
    const users = await ctx.db.query("users").take(500);
    const now = Date.now();
    for (const user of users.filter((item) => audienceMatches(item, campaign.audience))) {
      const delivery = await ctx.db.query("campaignDeliveries")
        .withIndex("by_campaign_user", (q) => q.eq("campaignId", campaign._id).eq("userId", user._id))
        .unique();
      if (!delivery) {
        await ctx.db.insert("campaignDeliveries", {
          campaignId: campaign._id,
          userId: user._id,
          impressionCount: 0,
        });
      }
      if (campaign.channel === "email" && user.email) {
        await enqueueIntegration(ctx, "brevo", "email_campaign", `campaign:${campaign._id}:${user._id}`, {
          to: [{ email: user.email, name: user.name }],
          subject: campaign.title,
          htmlContent: `<p>${campaign.body.replace(/[<>&]/g, "")}</p>${campaign.ctaDeepLink ? `<p><a href="${campaign.ctaDeepLink}">${campaign.ctaLabel ?? "Cookly öffnen"}</a></p>` : ""}`,
          headers: { "X-Cookly-Campaign": String(campaign._id) },
          tags: [String(campaign._id)],
        });
      }
      if (campaign.channel === "push" && user.notificationsEnabled) {
        const devices = await ctx.db.query("pushDevices")
          .withIndex("by_user_enabled", (q) => q.eq("userId", user._id).eq("enabled", true))
          .collect();
        for (const device of devices) {
          await enqueueIntegration(ctx, "fcm", "message", `campaign:${campaign._id}:${device._id}`, {
            token: device.token,
            notification: { title: campaign.title, body: campaign.body },
            data: {
              campaignId: String(campaign._id),
              deepLink: campaign.ctaDeepLink ?? "",
              billingUserId: user.billingUserId ?? String(user._id),
            },
          });
        }
      }
      await storeAnalyticsEvent(ctx, {
        eventId: `campaign:${campaign._id}:${user._id}:scheduled`,
        name: campaign.channel === "push" ? "push_scheduled" : "email_scheduled",
        version: 1,
        userId: user._id,
        billingUserId: user.billingUserId,
        platform: "server",
        properties: { campaignId: String(campaign._id), channel: campaign.channel },
        occurredAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.integrations.processJobs);
  },
});

export const recordExternalDelivery = internalMutation({
  args: {
    billingUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    campaignId: v.id("campaigns"),
    event: v.union(v.literal("impression"), v.literal("clicked"), v.literal("converted")),
  },
  handler: async (ctx, args) => {
    const user = args.billingUserId
      ? await ctx.db.query("users").withIndex("by_billingUserId", (q) => q.eq("billingUserId", args.billingUserId)).unique()
      : args.email
        ? await ctx.db.query("users").withIndex("email", (q) => q.eq("email", args.email)).first()
        : null;
    if (!user) return;
    const delivery = await ctx.db.query("campaignDeliveries")
      .withIndex("by_campaign_user", (q) => q.eq("campaignId", args.campaignId).eq("userId", user._id))
      .unique();
    if (!delivery) return;
    const now = Date.now();
    await ctx.db.patch(delivery._id, {
      impressionCount: delivery.impressionCount + (args.event === "impression" ? 1 : 0),
      ...(args.event === "impression" ? { lastShownAt: now } : {}),
      ...(args.event === "clicked" ? { clickedAt: now } : {}),
      ...(args.event === "converted" ? { convertedAt: now } : {}),
    });
  },
});

export const addSpendAdmin = internalMutation({
  args: {
    day: v.string(), channel: v.string(), source: v.string(), campaign: v.string(),
    adSet: v.optional(v.string()), creative: v.optional(v.string()),
    currency: v.string(), amount: v.number(), impressions: v.optional(v.number()),
    clicks: v.optional(v.number()), installs: v.optional(v.number()),
  },
  handler: (ctx, args) => ctx.db.insert("marketingSpend", { ...args, createdAt: Date.now() }),
});
