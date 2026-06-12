"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { getAuthUserId } from "@convex-dev/auth/server";
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

const buildLimitReachedError = (current: number, limit: number): Error => {
  return new Error(JSON.stringify({
    type: "LIMIT_REACHED",
    feature: "photo_scans",
    current,
    limit,
    message: `Du hast dein Limit von ${limit} Foto-Scans erreicht.`,
  }));
};

const buildRateLimitError = (resetAt: number): Error => {
  return new Error(JSON.stringify({
    type: "RATE_LIMIT_EXCEEDED",
    feature: "photo_scans",
    resetAt,
    message: "Zu viele Foto-Scans. Bitte warte einen Moment.",
  }));
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

    if (!GEMINI_KEY) {
      throw new Error("GEMINI_API_KEY is missing in Convex Environment Variables");
    }

    const limitStatus = await ctx.runQuery(internal.users.getPhotoScanLimitStatusByAuthUserId, {
      authUserId: authUserId.toString(),
    });
    if (!limitStatus.canProceed) {
      throw buildLimitReachedError(limitStatus.current, limitStatus.limit);
    }

    const rateLimit = await ctx.runMutation(internal.rateLimiter.checkAndConsumeRateLimit, {
      identifier: authUserId.toString(),
      bucket: "photo",
    });
    if (!rateLimit.allowed) {
      throw buildRateLimitError(rateLimit.resetAt);
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

    return { doc };
  },
});
