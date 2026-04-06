"use node";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { Id } from "./_generated/dataModel";
import { RECIPE_CATEGORIES } from "./constants";
import { getAuthUserId } from "@convex-dev/auth/server";
import { createImportTimer } from "./importTiming";

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

type RecipeData = {
  title?: string;
  category?: string;
  prepTimeMinutes?: number;
  difficulty?: "Einfach" | "Mittel" | "Schwer";
  portions?: number;
  ingredients?: Array<{ name: string; amount?: string; checked?: boolean }>;
  instructions?: Array<{ text: string; icon?: string }>;
  imageKeywords?: string;
};

const FACEBOOK_PROMPT = `
  Extrahiere aus diesem Facebook-Post ein strukturiertes Rezept:
  - Titel (erste Zeile oder Zusammenfassung)
  - Zutaten (Liste)
  - Zubereitung (Schritte)
  - Quelle: Facebook Post

  Caption:
  {{TEXT}}

  Format:
  {
    "title": "Name des Gerichts (aus dem Text oder erfinde einen passenden)",
    "category": "Eine der folgenden Kategorien (NUR eine davon wählen): Pasta, Salat, Suppe, Fleisch, Fisch, Vegetarisch, Vegan, Backen, Dessert, Frühstück, Snack, Beilage, Getränke, Sonstiges",
    "prepTimeMinutes": Zahl (geschätzt wenn nicht angegeben),
    "difficulty": "Einfach" | "Mittel" | "Schwer",
    "portions": Zahl (Standard 2 wenn nicht angegeben),
    "ingredients": [{"name": "Zutat", "amount": "Menge"}],
    "instructions": [{"text": "Schrittbeschreibung", "icon": "passendes Material Symbol Icon (snake_case)"}],
    "imageKeywords": "Kurze englische Beschreibung für Bildsuche"
  }

  Wähle für die Icons passende Material Symbols aus (z.B. outdoor_grill, timer, restaurant, blender, oven_gen, skillet, cookie, local_pizza, set_meal, soup_kitchen, flatware, egg, kitchen, microwave).
  Antworte NUR mit dem JSON.
`;

const extractCaptionFromPost = (post: Record<string, unknown>): string => {
  // Facebook Reels/Videos: message.text enthält den Caption-Text
  const message = post.message as Record<string, unknown> | undefined;
  if (message && typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text;
  }

  // Fallback für normale Posts: text oder message als String
  if (typeof post.text === "string" && post.text.trim().length > 0) {
    return post.text;
  }
  if (typeof post.message === "string" && post.message.trim().length > 0) {
    return post.message;
  }
  if (typeof post.caption === "string" && post.caption.trim().length > 0) {
    return post.caption;
  }
  if (typeof post.story === "string" && post.story.trim().length > 0) {
    return post.story;
  }

  return "";
};

const extractImageFromPost = (post: Record<string, unknown>): string => {
  // 1. Versuche media array (normale Posts mit Bildern)
  if (Array.isArray(post.media) && post.media.length > 0) {
    const media = post.media[0] as Record<string, unknown>;
    const photoImage = media.photo_image as Record<string, unknown> | undefined;
    if (photoImage?.uri && typeof photoImage.uri === "string") {
      return photoImage.uri;
    }
    if (typeof media.thumbnail === "string") {
      return media.thumbnail;
    }
  }

  // 2. Versuche short_form_video_context für Reels
  const videoContext = post.short_form_video_context as Record<string, unknown> | undefined;
  if (videoContext) {
    const playbackVideo = videoContext.playback_video as Record<string, unknown> | undefined;
    const thumbnail = playbackVideo?.thumbnailImage as Record<string, unknown> | undefined;
    if (thumbnail?.uri && typeof thumbnail.uri === "string") {
      return thumbnail.uri;
    }
    const preferredThumbnail = playbackVideo?.preferred_thumbnail as Record<string, unknown> | undefined;
    const prefImage = preferredThumbnail?.image as Record<string, unknown> | undefined;
    if (prefImage?.uri && typeof prefImage.uri === "string") {
      return prefImage.uri;
    }
    // video.first_frame_thumbnail
    const video = videoContext.video as Record<string, unknown> | undefined;
    if (typeof video?.first_frame_thumbnail === "string") {
      return video.first_frame_thumbnail;
    }
  }

  return "";
};

export const scrapePost = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<Id<"recipes">> => {
    const timer = createImportTimer("facebook", { url: args.url });
    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN is missing in Convex Environment Variables");
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is missing in Convex Environment Variables");
    timer.mark("env_checked");

    // ============================================================
    // 1. Authentifizierung
    // ============================================================
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("NOT_AUTHENTICATED");
    }
    const userIdStr = authUserId.toString();
    timer.mark("authenticated");

    // ============================================================
    // 2. Rate Limiting prüfen (10 Requests/Minute)
    // ============================================================
    const rateLimit = await ctx.runMutation(internal.rateLimiter.checkAndConsumeRateLimit, {
      identifier: userIdStr,
      bucket: "facebook",
    });
    if (!rateLimit.allowed) {
      throw new Error(JSON.stringify({
        type: "RATE_LIMIT_EXCEEDED",
        resetAt: rateLimit.resetAt,
        message: "Du hast zu viele Anfragen gestellt. Bitte warte einen Moment.",
      }));
    }
    timer.mark("rate_limit_checked");

    // ============================================================
    // 3. URL Validation
    // ============================================================
    if (!args.url.includes("facebook.com") && !args.url.includes("fb.watch")) {
      throw new Error("INVALID_FACEBOOK_URL");
    }
    timer.mark("url_validated");

    // ============================================================
    // 4. Check if already exists (Cost Optimization)
    // ============================================================
    const existingId = await ctx.runQuery(api.recipes.getBySourceUrl, { url: args.url });
    if (existingId) {
      console.log(`Recipe already exists for ${args.url}, returning existing ID.`);
      timer.mark("dedupe_hit");
      timer.summary({ result: "existing_recipe" });
      return existingId;
    }
    timer.mark("dedupe_miss");

    console.log(`Starting Facebook import for: ${args.url}`);

    // ============================================================
    // 5. Apify Call mit Graceful Degradation
    // ============================================================
    let caption: string;
    let imageUrl: string;

    try {
      // Faster than polling: wait for run completion and get dataset items in one request.
      const runResponse = await fetch(
        `https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startUrls: [{ url: args.url }],
            resultsLimit: 1,
          }),
          signal: AbortSignal.timeout(25000),
        }
      );

      if (!runResponse.ok) {
        throw new Error(`Apify run failed: ${runResponse.statusText}`);
      }

      const items = await runResponse.json();

      if (!items || items.length === 0) {
        throw new Error("No data found in Apify dataset");
      }

      const post = items[0] as Record<string, unknown>;
      caption = extractCaptionFromPost(post);
      console.log("Facebook caption extracted", { length: caption.length, preview: caption.substring(0, 100) });

      // Image Extraction
      imageUrl = extractImageFromPost(post);
      console.log("Facebook image extracted", { imageUrl: imageUrl.substring(0, 80) });
      timer.mark("apify_sync_done", { captionLength: caption.length, hasImage: !!imageUrl });

    } catch (apifyError) {
      console.error("Apify error:", apifyError);

      // Graceful Degradation: Fallback auf manuelle Eingabe
      throw new Error(JSON.stringify({
        type: "API_UNAVAILABLE",
        service: "apify",
        fallbackMode: "manual",
        prefillUrl: args.url,
        message: "Der Facebook-Service ist gerade nicht verfügbar. Bitte gib das Rezept manuell ein.",
      }));
    }

    // ============================================================
    // 6. Gemini AI Parsing mit Graceful Degradation
    // ============================================================
    let recipeData: RecipeData;

    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
      const prompt = FACEBOOK_PROMPT.replace("{{TEXT}}", caption);

      const result = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: prompt
      });

      const responseText = result.text || "";
      if (!responseText) {
        throw new Error("Gemini returned empty response");
      }

      const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      recipeData = JSON.parse(jsonStr) as RecipeData;

      const rawCategory = recipeData.category || "Sonstiges";
      recipeData.category = (RECIPE_CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : "Sonstiges";
      timer.mark("gemini_parsed", { hasIngredients: !!recipeData.ingredients?.length, hasInstructions: !!recipeData.instructions?.length });

    } catch (geminiError) {
      console.error("Gemini error:", geminiError);

      // Graceful Degradation: Fallback auf Basis-Rezept
      recipeData = {
        title: "Facebook Rezept",
        category: "Sonstiges",
        prepTimeMinutes: 15,
        difficulty: "Mittel",
        portions: 2,
        ingredients: [],
        instructions: [],
      };
      timer.mark("gemini_fallback_used");
    }
    timer.mark("ready_to_create");

    // ============================================================
    // 8. Save Recipe (sourceUrl gesetzt = link_imports Counter!)
    // ============================================================
    // Final duplicate check right before creating (race condition protection)
    const finalExisting = await ctx.runQuery(api.recipes.getBySourceUrl, { url: args.url });
    if (finalExisting) {
      console.log("Recipe already created by parallel request, returning existing");
      timer.mark("dedupe_final_hit");
      timer.summary({ result: "existing_recipe_final_check" });
      return finalExisting;
    }
    timer.mark("dedupe_final_miss");

    try {
      const newRecipeId = await ctx.runMutation(api.recipes.create, {
        title: recipeData.title || "Facebook Rezept",
        category: recipeData.category || "Sonstiges",
        prepTimeMinutes: recipeData.prepTimeMinutes || 15,
        difficulty: recipeData.difficulty || "Mittel",
        portions: recipeData.portions || 2,
        ingredients: recipeData.ingredients || [],
        instructions: recipeData.instructions || [],
        image: imageUrl || undefined,
        sourceImageUrl: imageUrl,
        sourceUrl: args.url,
        imageAlt: recipeData.title || "Facebook Rezept",
        isFavorite: false,
      });

      timer.mark("recipe_created", { recipeId: newRecipeId });
      timer.summary({ result: "created" });
      return newRecipeId;

    } catch (createError: unknown) {
      // Limit reached Error weiterwerfen
      const errStr = createError instanceof Error ? createError.message : "";
      if (errStr.includes("LIMIT_REACHED")) {
        throw createError;
      }
      throw new Error("Fehler beim Speichern des Rezepts.");
    }
  },
});
