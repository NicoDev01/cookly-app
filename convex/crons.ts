import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.hourly("cleanup expired storage assets", { minuteUTC: 0 }, internal.storageAssets.cleanupExpired);
crons.hourly("cleanup expired import operations", { minuteUTC: 10 }, internal.importOperations.cleanupExpired);
crons.daily("cleanup account deletion tombstones", { hourUTC: 3, minuteUTC: 20 }, internal.accountDeletion.cleanupCompleted);
crons.interval("process integration jobs", { minutes: 5 }, internal.integrations.processJobs);
crons.daily("analytics synthetic control", { hourUTC: 2, minuteUTC: 10 }, internal.analytics.syntheticCheck);
crons.daily("mark dormant users", { hourUTC: 2, minuteUTC: 30 }, internal.growth.markDormantUsers);
// 06:00 UTC = 08:00 Sommerzeit, 07:00 UTC = 08:00 Winterzeit; sendDaily prüft die deutsche Uhrzeit.
crons.cron("daily ops digest", "0 6,7 * * *", internal.digest.sendDaily, {});

export default crons;
