/**
 * Rate Limiter für API-Aufrufe
 *
 * Schützt vor API-Spamming:
 * - Max 10 Requests pro Minute pro User
 * - Getrennte Limits für Apify, Jina, Gemini
 */

// In-Memory Rate Limiting (per Function Instance)
// Für Production: Redis oder Convex Cache verwenden
const userRateLimits = new Map<string, {
  count: number;
  windowStart: number;
}>();

const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 10,
  WINDOW_MS: 60 * 1000, // 1 Minute
};

/**
 * Prüft ob User Rate Limit überschritten hat
 * @param clerkId - User ID
 * @returns true wenn Request erlaubt, false wenn limit erreicht
 */
export const checkRateLimit = (clerkId: string): boolean => {
  const now = Date.now();
  const userLimit = userRateLimits.get(clerkId);

  // Kein Eintrag oder Window abgelaufen -> Reset
  if (!userLimit || now - userLimit.windowStart > RATE_LIMIT.WINDOW_MS) {
    userRateLimits.set(clerkId, {
      count: 1,
      windowStart: now,
    });
    return true;
  }

  // Window noch aktiv -> Prüfen
  if (userLimit.count >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
    return false; // Rate limit exceeded
  }

  // Erhöhen
  userLimit.count++;
  return true;
};

/**
 * Gibt verbleibende Requests zurück
 * @param clerkId - User ID
 * @returns Remaining requests und reset timestamp
 */
export const getRateLimitStatus = (clerkId: string) => {
  const userLimit = userRateLimits.get(clerkId);
  const now = Date.now();

  if (!userLimit || now - userLimit.windowStart > RATE_LIMIT.WINDOW_MS) {
    return {
      remaining: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE,
      resetAt: now + RATE_LIMIT.WINDOW_MS,
      limit: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE,
    };
  }

  return {
    remaining: Math.max(0, RATE_LIMIT.MAX_REQUESTS_PER_MINUTE - userLimit.count),
    resetAt: userLimit.windowStart + RATE_LIMIT.WINDOW_MS,
    limit: RATE_LIMIT.MAX_REQUESTS_PER_MINUTE,
  };
};

/**
 * Reset Rate Limit (für Testing/Admin)
 * @param clerkId - User ID
 */
export const resetRateLimit = (clerkId: string) => {
  userRateLimits.delete(clerkId);
};

/**
 * Gibt alle Rate Limits zurück (für Debugging)
 */
export const getAllRateLimits = () => {
  return Array.from(userRateLimits.entries()).map(([clerkId, data]) => ({
    clerkId,
    ...data,
  }));
};

/**
 * Cleanup abgelaufene Entries (wird periodisch aufgerufen)
 */
export const cleanupExpiredRateLimits = () => {
  const now = Date.now();
  const expired: string[] = [];

  for (const [clerkId, data] of userRateLimits.entries()) {
    if (now - data.windowStart > RATE_LIMIT.WINDOW_MS) {
      expired.push(clerkId);
    }
  }

  for (const clerkId of expired) {
    userRateLimits.delete(clerkId);
  }

  return expired.length;
};
