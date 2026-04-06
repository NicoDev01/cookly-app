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

const INSTAGRAM_PROMPT = `
  Extrahiere aus dieser Instagram-Caption ein strukturiertes Rezept:
  - Titel (erste Zeile oder Zusammenfassung)
  - Zutaten (Liste)
  - Zubereitung (Schritte)
  - Quelle: Instagram Post

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

export const scrapePost = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<Id<"recipes">> => {
    const timer = createImportTimer("instagram", { url: args.url });
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
      bucket: "instagram",
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
    if (!args.url.includes("instagram.com/p/") && !args.url.includes("instagram.com/reel/")) {
      throw new Error("INVALID_INSTAGRAM_URL");
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

    console.log(`Starting Instagram import for: ${args.url}`);

    // ============================================================
    // 5. Apify Call mit Graceful Degradation
    // ============================================================
    let caption: string;
    let imageUrl: string;

    try {
      // Faster than polling: wait for run completion and get dataset items in one request.
      const runResponse = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directUrls: [args.url],
            resultsType: "posts",
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

      const post = items[0];
      caption = post.caption || "";

      // Image Extraction
      if (post.images && post.images.length > 0) {
        imageUrl = post.images[0];
      } else {
        imageUrl = post.displayUrl || post.thumbnailUrl || post.videoUrl || "";
      }
      timer.mark("apify_sync_done", { captionLength: caption.length, hasImage: !!imageUrl });

    } catch (apifyError) {
      console.error("Apify error:", apifyError);

      // Graceful Degradation: Fallback auf manuelle Eingabe
      throw new Error(JSON.stringify({
        type: "API_UNAVAILABLE",
        service: "apify",
        fallbackMode: "manual",
        prefillUrl: args.url,
        message: "Der Instagram-Service ist gerade nicht verfügbar. Bitte gib das Rezept manuell ein.",
      }));
    }

    // ============================================================
    // 6. Gemini AI Parsing mit Graceful Degradation
    // ============================================================
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
    let recipeData: RecipeData;

    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
      const prompt = INSTAGRAM_PROMPT.replace("{{TEXT}}", caption);

      const result = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: prompt
      });

      const responseText = result.text || "";
      if (!responseText) {
        throw new Error("Gemini returned empty response");
      }

      const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      recipeData = JSON.parse(jsonStr);

      const rawCategory = recipeData.category || "Sonstiges";
      recipeData.category = (RECIPE_CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : "Sonstiges";
      timer.mark("gemini_parsed", { hasIngredients: !!recipeData.ingredients?.length, hasInstructions: !!recipeData.instructions?.length });

    } catch (geminiError) {
      console.error("Gemini error:", geminiError);

      // Graceful Degradation: Fallback auf Basis-Rezept
      recipeData = {
        title: "Instagram Rezept",
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
        title: recipeData.title || "Instagram Rezept",
        category: recipeData.category || "Sonstiges",
        prepTimeMinutes: recipeData.prepTimeMinutes || 15,
        difficulty: recipeData.difficulty || "Mittel",
        portions: recipeData.portions || 2,
        ingredients: recipeData.ingredients || [],
        instructions: recipeData.instructions || [],
        image: imageUrl || undefined,
        sourceImageUrl: imageUrl,
        sourceUrl: args.url,  // Setzt featureType = "link_imports"
        imageAlt: recipeData.title,
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
