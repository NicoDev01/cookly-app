import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { enqueueIntegration } from "./integrations";

export const registerDevice = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("android"), v.literal("ios"), v.literal("web")),
    deviceId: v.string(),
    locale: v.optional(v.string()),
    timezone: v.optional(v.string()),
    appVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("NOT_AUTHENTICATED");
    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
      .first();
    if (!user) throw new Error("NOT_AUTHENTICATED");
    const existing = await ctx.db
      .query("pushDevices")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, userId: user._id, enabled: true, lastSeenAt: now, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("pushDevices", {
      ...args,
      userId: user._id,
      enabled: true,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const disableDevice = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return;
    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
      .first();
    if (!user) return;
    const device = await ctx.db
      .query("pushDevices")
      .withIndex("by_user_device", (q) => q.eq("userId", user._id).eq("deviceId", args.deviceId))
      .unique();
    if (device) await ctx.db.patch(device._id, { enabled: false, updatedAt: Date.now() });
  },
});

export const enqueueForUser = internalMutation({
  args: {
    userId: v.id("users"),
    campaignId: v.optional(v.id("campaigns")),
    title: v.string(),
    body: v.string(),
    deepLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.notificationsEnabled) return 0;

    const devices = await ctx.db
      .query("pushDevices")
      .withIndex("by_user_enabled", (q) => q.eq("userId", args.userId).eq("enabled", true))
      .collect();
    for (const device of devices) {
      await enqueueIntegration(ctx, "fcm", "message", `${args.campaignId ?? "direct"}:${device.token}:${Date.now()}`, {
        token: device.token,
        notification: { title: args.title, body: args.body },
        data: {
          campaignId: args.campaignId ? String(args.campaignId) : "",
          deepLink: args.deepLink ?? "",
        },
      });
    }
    if (devices.length) await ctx.scheduler.runAfter(0, internal.integrations.processJobs);
    return devices.length;
  },
});
