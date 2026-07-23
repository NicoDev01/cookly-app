import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.hourly("cleanup expired storage assets", { minuteUTC: 0 }, internal.storageAssets.cleanupExpired);
crons.hourly("cleanup expired import operations", { minuteUTC: 10 }, internal.importOperations.cleanupExpired);
crons.daily("cleanup account deletion tombstones", { hourUTC: 3, minuteUTC: 20 }, internal.accountDeletion.cleanupCompleted);
crons.interval("process integration jobs", { minutes: 5 }, internal.integrations.processJobs);
crons.daily("analytics synthetic control", { hourUTC: 2, minuteUTC: 10 }, internal.analytics.syntheticCheck);
crons.daily("mark dormant users", { hourUTC: 2, minuteUTC: 30 }, internal.growth.markDormantUsers);

export default crons;
