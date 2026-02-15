"use node";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { Id } from "./_generated/dataModel";
import { checkRateLimit, getRateLimitStatus } from "./rateLimiter";

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
    "category": "Eine passende Kategorie (z.B. Pasta, Salat, Dessert)",
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
    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN is missing in Convex Environment Variables");
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is missing in Convex Environment Variables");

    // ============================================================
    // 1. Authentifizierung
    // ============================================================
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("NOT_AUTHENTICATED");
    }
    const clerkId = identity.subject;

    // ============================================================
    // 2. Rate Limiting prüfen (10 Requests/Minute)
    // ============================================================
    if (!checkRateLimit(clerkId)) {
      const status = getRateLimitStatus(clerkId);
      throw new Error(JSON.stringify({
        type: "RATE_LIMIT_EXCEEDED",
        resetAt: status.resetAt,
        message: "Du hast zu viele Anfragen gestellt. Bitte warte einen Moment.",
      }));
    }

    // ============================================================
    // 3. URL Validation
    // ============================================================
    if (!args.url.includes("instagram.com/p/") && !args.url.includes("instagram.com/reel/")) {
      throw new Error("INVALID_INSTAGRAM_URL");
    }

    // ============================================================
    // 4. Check if already exists (Cost Optimization)
    // ============================================================
    const existingId = await ctx.runQuery(api.recipes.getBySourceUrl, { url: args.url, clerkId });
    if (existingId) {
      console.log(`Recipe already exists for ${args.url}, returning existing ID.`);
      return existingId;
    }

    console.log(`Starting Instagram import for: ${args.url}`);

    // ============================================================
    // 5. Apify Call mit Graceful Degradation
    // ============================================================
    let caption: string;
    let imageUrl: string;

    try {
      // Apify Run starten
      const runResponse = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directUrls: [args.url],
            resultsType: "posts",
            resultsLimit: 1,
          }),
        }
      );

      if (!runResponse.ok) {
        throw new Error(`Apify run failed: ${runResponse.statusText}`);
      }

      const runData = await runResponse.json();
      const runId = runData.data.id;

      // Polling
      let datasetId: string | undefined;
      let attempts = 0;
      while (attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
        );
        const statusData = await statusRes.json();
        const status = statusData.data.status;

        if (status === "SUCCEEDED") {
          datasetId = statusData.data.defaultDatasetId;
          break;
        }
        if (status === "FAILED" || status === "ABORTED") {
          throw new Error(`Apify run ${status}`);
        }
        attempts++;
      }

      if (!datasetId) {
        throw new Error("Apify run timed out");
      }

      // Results fetchen
      const itemsRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json&limit=1`
      );
      const items = await itemsRes.json();

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
        model: "gemini-3-flash-preview",
        contents: prompt
      });

      const responseText = result.text || "";
      if (!responseText) {
        throw new Error("Gemini returned empty response");
      }

      const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      recipeData = JSON.parse(jsonStr);

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
    }

    // ============================================================
    // 7. Image Handling mit Graceful Degradation
    // ============================================================
    let imageStorageId: Id<"_storage"> | undefined;
    let finalImageUrl = imageUrl;

    try {
      if (imageUrl) {
        const imageRes = await fetch(imageUrl);
        if (imageRes.ok) {
          const imageBlob = await imageRes.blob();
          const uploadUrl = await ctx.runMutation(api.recipes.generateImageUploadUrl);
          const uploadRes = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": imageBlob.type },
            body: imageBlob,
          });

          if (uploadRes.ok) {
            const { storageId } = await uploadRes.json();
            imageStorageId = storageId;
          }
        }
      }
    } catch (imageError) {
      console.warn("Instagram image download failed:", imageError);
      // Fallback: Pollinations
      try {
        const safeTitle = encodeURIComponent(recipeData.title || "Delicious Food");
        const pollinationsUrl = `https://image.pollinations.ai/prompt/realistic%20food%20photography%20${safeTitle}?width=1024&height=1024&model=klein&nologo=true`;

        const pollRes = await fetch(pollinationsUrl);
        if (pollRes.ok) {
          const pollBlob = await pollRes.blob();
          const uploadUrl = await ctx.runMutation(api.recipes.generateImageUploadUrl);

          const uploadRes = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": pollBlob.type },
            body: pollBlob,
          });

          if (uploadRes.ok) {
            const { storageId } = await uploadRes.json();
            imageStorageId = storageId;
            finalImageUrl = pollinationsUrl;
          }
        }
      } catch (pollErr) {
        console.error("Pollinations fallback also failed:", pollErr);
      }
    }

    // ============================================================
    // 8. Save Recipe (sourceUrl gesetzt = link_imports Counter!)
    // ============================================================
    // Final duplicate check right before creating (race condition protection)
    const finalExisting = await ctx.runQuery(api.recipes.getBySourceUrl, { url: args.url, clerkId });
    if (finalExisting) {
      console.log("Recipe already created by parallel request, returning existing");
      return finalExisting;
    }

    try {
      const newRecipeId = await ctx.runMutation(api.recipes.create, {
        title: recipeData.title || "Instagram Rezept",
        category: recipeData.category || "Sonstiges",
        prepTimeMinutes: recipeData.prepTimeMinutes || 15,
        difficulty: recipeData.difficulty || "Mittel",
        portions: recipeData.portions || 2,
        ingredients: recipeData.ingredients || [],
        instructions: recipeData.instructions || [],
        image: finalImageUrl,
        imageStorageId: imageStorageId,
        sourceImageUrl: imageUrl,
        sourceUrl: args.url,  // Setzt featureType = "link_imports"
        imageAlt: recipeData.title,
        isFavorite: false,
      });

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
