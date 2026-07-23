"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODELS } from "./constants";
import { runWithGeminiRetry } from "../utils/geminiRetry";
import {
  AI_SCAN_PROMPT_FIXED,
  AI_SCAN_RESPONSE_JSON_SCHEMA,
  normalizeAiScanResult,
  parseGeminiJson,
} from "./photoScanShared";

const GEMINI_KEY = process.env.GEMINI_API_KEY;

const fallbackValidator = v.object({
  title: v.string(),
  category: v.string(),
  prepTimeMinutes: v.number(),
  difficulty: v.string(),
  portions: v.number(),
  image: v.string(),
  imageAlt: v.string(),
});

const recipeScanDocValidator = v.object({
  title: v.string(),
  category: v.string(),
  prepTimeMinutes: v.number(),
  difficulty: v.union(v.literal("Einfach"), v.literal("Mittel"), v.literal("Schwer")),
  portions: v.number(),
  ingredients: v.array(v.object({
    name: v.string(),
    amount: v.optional(v.string()),
  })),
  instructions: v.array(v.object({
    text: v.string(),
    icon: v.optional(v.string()),
  })),
  image: v.string(),
  imageAlt: v.string(),
});

const toBase64 = (buffer: ArrayBuffer): string => {
  return Buffer.from(buffer).toString("base64");
};

export const scanRecipePhoto = action({
  args: {
    storageId: v.id("_storage"),
    fallback: fallbackValidator,
  },
  returns: v.object({ doc: recipeScanDocValidator }),
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");
    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) throw new Error("NOT_AUTHENTICATED");

    await ctx.runMutation(internal.storageAssets.registerServerAssetForUser, {
      storageId: args.storageId,
      userId: user._id,
      purpose: "photo_scan",
    });
    return await ctx.runAction(internal.photoScan.scanRecipePhotoInternal, {
      userId: user._id,
      ...args,
    });
  },
});

export const scanRecipePhotoInternal = internalAction({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fallback: fallbackValidator,
  },
  returns: v.object({ doc: recipeScanDocValidator }),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.storageAssets.getPendingPhotoScanForUser, { userId: args.userId, storageId: args.storageId });

    if (!GEMINI_KEY) {
      throw new Error("GEMINI_API_KEY is missing in Convex Environment Variables");
    }

    const imageBlob = await ctx.storage.get(args.storageId);
    if (!imageBlob) throw new Error("Bild konnte nicht aus dem Speicher gelesen werden.");

    const mimeType = imageBlob.type || "image/jpeg";
    if (!mimeType.startsWith("image/")) {
      throw new Error("Die hochgeladene Datei ist kein Bild.");
    }

    const base64Data = toBase64(await imageBlob.arrayBuffer());
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

    const response = await runWithGeminiRetry(() =>
      ai.models.generateContent({
        model: GEMINI_MODELS.recipeImageScan,
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: AI_SCAN_PROMPT_FIXED.trim() },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: AI_SCAN_RESPONSE_JSON_SCHEMA,
          temperature: 0,
        },
      })
    );

    const parsed = parseGeminiJson(response.text);
    const doc = normalizeAiScanResult(parsed, args.fallback);
    await ctx.runMutation(internal.storageAssets.releasePendingAssetForUser, { userId: args.userId, storageId: args.storageId });

    return { doc };
  },
});
