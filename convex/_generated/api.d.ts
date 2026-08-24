/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountDeletion from "../accountDeletion.js";
import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as billingModel from "../billingModel.js";
import type * as categories from "../categories.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as experiments from "../experiments.js";
import type * as facebook from "../facebook.js";
import type * as growth from "../growth.js";
import type * as http from "../http.js";
import type * as importOperations from "../importOperations.js";
import type * as importTiming from "../importTiming.js";
import type * as instagram from "../instagram.js";
import type * as integrations from "../integrations.js";
import type * as legacyImport from "../legacyImport.js";
import type * as lib_authUser from "../lib/authUser.js";
import type * as lib_remoteImagePolicy from "../lib/remoteImagePolicy.js";
import type * as lib_socialUrls from "../lib/socialUrls.js";
import type * as lib_tiktokContent from "../lib/tiktokContent.js";
import type * as marketing from "../marketing.js";
import type * as migrateUserStats from "../migrateUserStats.js";
import type * as photoScan from "../photoScan.js";
import type * as photoScanShared from "../photoScanShared.js";
import type * as pollinationsHelper from "../pollinationsHelper.js";
import type * as push from "../push.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as recipes from "../recipes.js";
import type * as remoteImages from "../remoteImages.js";
import type * as shopping from "../shopping.js";
import type * as socialImport from "../socialImport.js";
import type * as socialImportPrompts from "../socialImportPrompts.js";
import type * as socialImportShared from "../socialImportShared.js";
import type * as storageAssets from "../storageAssets.js";
import type * as stripe from "../stripe.js";
import type * as stripeInternal from "../stripeInternal.js";
import type * as tiktok from "../tiktok.js";
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
  accountDeletion: typeof accountDeletion;
  admin: typeof admin;
  analytics: typeof analytics;
  auth: typeof auth;
  billing: typeof billing;
  billingModel: typeof billingModel;
  categories: typeof categories;
  constants: typeof constants;
  crons: typeof crons;
  experiments: typeof experiments;
  facebook: typeof facebook;
  growth: typeof growth;
  http: typeof http;
  importOperations: typeof importOperations;
  importTiming: typeof importTiming;
  instagram: typeof instagram;
  integrations: typeof integrations;
  legacyImport: typeof legacyImport;
  "lib/authUser": typeof lib_authUser;
  "lib/remoteImagePolicy": typeof lib_remoteImagePolicy;
  "lib/socialUrls": typeof lib_socialUrls;
  "lib/tiktokContent": typeof lib_tiktokContent;
  marketing: typeof marketing;
  migrateUserStats: typeof migrateUserStats;
  photoScan: typeof photoScan;
  photoScanShared: typeof photoScanShared;
  pollinationsHelper: typeof pollinationsHelper;
  push: typeof push;
  rateLimiter: typeof rateLimiter;
  recipes: typeof recipes;
  remoteImages: typeof remoteImages;
  shopping: typeof shopping;
  socialImport: typeof socialImport;
  socialImportPrompts: typeof socialImportPrompts;
  socialImportShared: typeof socialImportShared;
  storageAssets: typeof storageAssets;
  stripe: typeof stripe;
  stripeInternal: typeof stripeInternal;
  tiktok: typeof tiktok;
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
