import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 Minuten

/**
 * Prüft ob ein Import für diese URL bereits läuft
 * Gibt true zurück wenn ein aktiver Lock existiert
 */
export const checkLock = query({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const lock = await ctx.db
      .query("importLocks")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .first();

    if (!lock) return null;

    // Lock ist abgelaufen (älter als 5 Minuten)
    if (lock.status === "pending" && now - lock.startedAt > LOCK_TIMEOUT_MS) {
      return null;
    }

    return lock;
  },
});

/**
 * Versucht einen Lock zu erwerben
 * Gibt { success: true, lockId } zurück wenn erfolgreich
 * Gibt { success: false, reason } zurück wenn Lock bereits existiert
 */
export const acquireLock = mutation({
  args: { url: v.string(), clerkId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Prüfe ob bereits ein aktiver Lock existiert
    const existingLock = await ctx.db
      .query("importLocks")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .first();

    if (existingLock) {
      // Lock ist noch aktiv (pending und nicht abgelaufen)
      if (existingLock.status === "pending" && now - existingLock.startedAt < LOCK_TIMEOUT_MS) {
        return {
          success: false as const,
          reason: "IMPORT_IN_PROGRESS",
          existingLock: {
            clerkId: existingLock.clerkId,
            startedAt: existingLock.startedAt,
          },
        };
      }

      // Lock ist abgelaufen oder completed/failed -> überschreiben
      await ctx.db.patch(existingLock._id, {
        clerkId: args.clerkId,
        startedAt: now,
        status: "pending",
      });

      return { success: true as const, lockId: existingLock._id };
    }

    // Neuen Lock erstellen
    const lockId = await ctx.db.insert("importLocks", {
      url: args.url,
      clerkId: args.clerkId,
      startedAt: now,
      status: "pending",
    });

    return { success: true as const, lockId };
  },
});

/**
 * Aktualisiert den Lock-Status auf completed oder failed
 */
export const releaseLock = mutation({
  args: {
    url: v.string(),
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    const lock = await ctx.db
      .query("importLocks")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .first();

    if (lock) {
      await ctx.db.patch(lock._id, { status: args.status });
    }
  },
});

/**
 * Cleanup: Löscht alte Lock-Einträge (älter als 5 Minuten)
 * Wird nach jedem erfolgreichen Import aufgerufen
 */
export const cleanupOldLocks = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - LOCK_TIMEOUT_MS;

    // Hole alle alten Locks
    const oldLocks = await ctx.db
      .query("importLocks")
      .filter((q) => q.lt(q.field("startedAt"), cutoff))
      .collect();

    // Lösche alle alten Locks
    for (const lock of oldLocks) {
      await ctx.db.delete(lock._id);
    }

    return { deleted: oldLocks.length };
  },
});
