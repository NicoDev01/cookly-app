/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as categories from "../categories.js";
import type * as facebook from "../facebook.js";
import type * as http from "../http.js";
import type * as importLocks from "../importLocks.js";
import type * as instagram from "../instagram.js";
import type * as migrateUserStats from "../migrateUserStats.js";
import type * as pollinationsHelper from "../pollinationsHelper.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as recipes from "../recipes.js";
import type * as shopping from "../shopping.js";
import type * as stripe from "../stripe.js";
import type * as stripeInternal from "../stripeInternal.js";
import type * as unsplashHelper from "../unsplashHelper.js";
import type * as users from "../users.js";
import type * as website from "../website.js";
import type * as weekly from "../weekly.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  categories: typeof categories;
  facebook: typeof facebook;
  http: typeof http;
  importLocks: typeof importLocks;
  instagram: typeof instagram;
  migrateUserStats: typeof migrateUserStats;
  pollinationsHelper: typeof pollinationsHelper;
  rateLimiter: typeof rateLimiter;
  recipes: typeof recipes;
  shopping: typeof shopping;
  stripe: typeof stripe;
  stripeInternal: typeof stripeInternal;
  unsplashHelper: typeof unsplashHelper;
  users: typeof users;
  website: typeof website;
  weekly: typeof weekly;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
