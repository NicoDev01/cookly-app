import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { getAuthenticatedUserId } from "./lib/authUser";
import {
  MAX_SHARE_TOKENS_PER_USER,
  SHARE_TOKEN_TTL_MS,
  generateShareToken,
  hashShareToken,
  isValidInstallationId,
} from "./lib/shareImport";

/**
 * Stellt für dieses Gerät einen neuen Import-Token aus (Klartext nur in dieser Antwort).
 * Ersetzt den alten Token derselben installationId; mehr als 5 aktive Tokens verdrängen den ältesten.
 */
export const issue = mutation({
  args: { installationId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!isValidInstallationId(args.installationId)) throw new Error("INVALID_INSTALLATION_ID");
    const now = Date.now();
    const existing = await ctx.db.query("shareTokens").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const active = [];
    for (const row of existing) {
      if (row.installationId === args.installationId || row.expiresAt <= now) await ctx.db.delete(row._id);
      else active.push(row);
    }
    active.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    for (const row of active.slice(0, Math.max(0, active.length - (MAX_SHARE_TOKENS_PER_USER - 1)))) {
      await ctx.db.delete(row._id);
    }

    const token = generateShareToken();
    const expiresAt = now + SHARE_TOKEN_TTL_MS;
    await ctx.db.insert("shareTokens", {
      userId,
      tokenHash: await hashShareToken(token),
      installationId: args.installationId,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    });
    return { token, expiresAt };
  },
});

export const revoke = mutation({
  args: { installationId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    const rows = await ctx.db.query("shareTokens").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    let revoked = 0;
    for (const row of rows) {
      if (row.installationId !== args.installationId) continue;
      await ctx.db.delete(row._id);
      revoked++;
    }
    return { revoked };
  },
});

/** Hash → Nutzer. Abgelaufene Tokens gelten als unbekannt. */
export const resolve = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("shareTokens").withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash)).unique();
    if (!row || row.expiresAt <= Date.now()) return null;
    return { tokenId: row._id, userId: row.userId };
  },
});

/** Gleitende Laufzeit: jeder Import aus der Extension verlängert den Token. */
export const touch = internalMutation({
  args: { tokenId: v.id("shareTokens") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenId);
    if (!row) return;
    const now = Date.now();
    await ctx.db.patch(row._id, { lastUsedAt: now, expiresAt: now + SHARE_TOKEN_TTL_MS });
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("shareTokens").withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now())).take(200);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
