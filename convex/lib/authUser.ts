import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function getAuthenticatedUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) throw new Error("Not authenticated");
  const linkedUser = await ctx.db.query("users")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId.toString()))
    .first();
  if (linkedUser) return linkedUser._id;
  if (await ctx.db.get(authUserId as Id<"users">)) return authUserId as Id<"users">;
  throw new Error("User not found");
}
