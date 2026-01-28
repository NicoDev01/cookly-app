/**
 * MIGRATION SCRIPT: Transform user usageStats from old to new schema
 *
 * OLD: { importedRecipes: number, importsLastReset: number, weeklyPlansActive: number }
 * NEW: { manualRecipes: number, linkImports: number, photoScans: number, resetOnDowngrade: boolean, ... }
 *
 * Run this once with: npx convex run migrateUserStats
 */

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const migrateUserStats = internalMutation({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    let migratedCount = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        const oldStats = user.usageStats as any;

        // Skip if already migrated (has new fields)
        if (
          oldStats.manualRecipes !== undefined &&
          oldStats.linkImports !== undefined &&
          oldStats.photoScans !== undefined
        ) {
          console.log(`User ${user.clerkId} already migrated, skipping.`);
          continue;
        }

        // Transform old data to new schema
        const newUsageStats = {
          // Counter distribution: old importedRecipes gets split based on reasonable defaults
          // Since we can't distinguish between manual/link/photo in old data, we put everything in manualRecipes
          manualRecipes: oldStats.importedRecipes || 0,

          // New counters start at 0 (we don't have historical data)
          linkImports: 0,
          photoScans: 0,

          // Subscription period tracking (undefined for free users)
          subscriptionStartDate: undefined,
          subscriptionEndDate: undefined,

          // Reset flag
          resetOnDowngrade: false,
        };

        await ctx.db.patch(user._id, {
          usageStats: newUsageStats,
        });

        migratedCount++;
        console.log(`Migrated user ${user.clerkId}:`, {
          old: oldStats,
          new: newUsageStats,
        });

      } catch (error) {
        const errorMsg = `Failed to migrate user ${user.clerkId}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`\n=== Migration Summary ===`);
    console.log(`Total users: ${users.length}`);
    console.log(`Migrated: ${migratedCount}`);
    console.log(`Already up-to-date: ${users.length - migratedCount - errors.length}`);
    console.log(`Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.error("\n=== Errors ===");
      errors.forEach((err) => console.error(err));
    }

    return {
      total: users.length,
      migrated: migratedCount,
      errors: errors.length,
    };
  },
});
