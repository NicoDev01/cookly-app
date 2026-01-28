"use node";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { Id } from "./_generated/dataModel";
import { checkRateLimit, getRateLimitStatus } from "./rateLimiter";

const JINA_API_KEY = process.env.JINA_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const WEBSITE_RECIPE_PROMPT = `
Extrahiere aus diesem Rezept-Inhalt ein strukturiertes Rezept.

Seitentitel: {{TITLE}}

Inhalt (Markdown):
{{MARKDOWN}}

Format:
{
  "title": "Rezeptname (nutze den Seitentitel als Basis, falls sinnvoll)",
  "category": "Eine passende Kategorie (z.B. Pasta, Salat, Fleisch, Dessert, Backen, Suppe, Vorspeise, Beilage)",
  "prepTimeMinutes": Zahl (geschätzt wenn nicht angegeben),
  "difficulty": "Einfach" | "Mittel" | "Schwer",
  "portions": Zahl (Standard 4 wenn nicht angegeben),
  "ingredients": [{"name": "Zutat", "amount": "Menge"}],
  "instructions": [{"text": "Schrittbeschreibung", "icon": "passendes Material Symbol Icon (snake_case)"}],
  "imageKeywords": "Kurze englische Beschreibung für Bildsuche"
}

Wähle für die Icons passende Material Symbols aus (z.B. outdoor_grill, timer, restaurant, blender, oven_gen, skillet, cookie, local_pizza, set_meal, soup_kitchen, flatware, egg, kitchen, microwave).
Antworte NUR mit dem JSON.
`;

export const scrapeWebsite = action({
    args: { url: v.string() },
    handler: async (ctx, args): Promise<Id<"recipes">> => {
        if (!JINA_API_KEY) throw new Error("JINA_API_KEY is missing in Convex Environment Variables");
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

        // Check if we already have this recipe to save costs and time
        const existingId = await ctx.runQuery(api.recipes.getBySourceUrl, { url: args.url });
        if (existingId) {
            console.log(`Recipe already exists for ${args.url}, returning existing ID.`);
            return existingId;
        }

        console.log(`Starting website import for: ${args.url}`);

        // ============================================================
        // 3. Fetch Content via Jina AI Reader mit Graceful Degradation
        // ============================================================
        let pageTitle: string;
        let markdown: string;
        let pageImageUrl: string;

        try {
            const jinaUrl = `https://r.jina.ai/${encodeURIComponent(args.url)}`;

            const jinaResponse = await fetch(jinaUrl, {
                headers: {
                    "Authorization": `Bearer ${JINA_API_KEY}`,
                    "Accept": "application/json",
                    "X-Timeout": "10", // Jina server-side timeout: 10 seconds
                },
                signal: AbortSignal.timeout(15000), // Client-side timeout: 15 seconds
            });

            if (!jinaResponse.ok) {
                throw new Error(`Jina AI request failed (${jinaResponse.status})`);
            }

            const jinaData = await jinaResponse.json();

            if (!jinaData.data) {
                throw new Error("Jina AI returned no data");
            }

            pageTitle = jinaData.data.title || "";
            markdown = jinaData.data.content || "";
            pageImageUrl = jinaData.data.images?.[0] || "";

            console.log(`Extracted content. Title: "${pageTitle}", Markdown length: ${markdown.length} chars`);

        } catch (jinaError) {
            console.error("Jina AI error:", jinaError);

            // Graceful Degradation: Fallback auf manuelle Eingabe
            throw new Error(JSON.stringify({
                type: "API_UNAVAILABLE",
                service: "jina",
                fallbackMode: "manual",
                prefillUrl: args.url,
                message: "Der Website-Import-Service ist gerade nicht verfügbar. Bitte gib das Rezept manuell ein.",
            }));
        }

        // 2. Limit markdown to prevent Gemini context overflow (max 50K chars)
        const truncatedMarkdown = markdown.slice(0, 50000);

        // ============================================================
        // 4. Parse with Gemini mit Graceful Degradation
        // ============================================================
        let recipeData: any;

        try {
            const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
            const prompt = WEBSITE_RECIPE_PROMPT
                .replace("{{TITLE}}", pageTitle)
                .replace("{{MARKDOWN}}", truncatedMarkdown);

            const result = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
            });

            const responseText = result.text || "";

            if (!responseText) {
                throw new Error("Gemini returned empty response");
            }

            // Clean JSON
            const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
            recipeData = JSON.parse(jsonStr);

        } catch (geminiError) {
            console.error("Gemini error:", geminiError);

            // Graceful Degradation: Fallback auf Basis-Rezept
            recipeData = {
                title: pageTitle || "Website Rezept",
                category: "Sonstiges",
                prepTimeMinutes: 30,
                difficulty: "Mittel",
                portions: 4,
                ingredients: [],
                instructions: [],
            };
        }

        // 4. Image Handling (Download & Store)
        // Priority: Use page image if available, otherwise generate via Pollinations
        let imageStorageId: Id<"_storage"> | undefined;
        let finalImageUrl = pageImageUrl;

        if (pageImageUrl) {
            try {
                console.log(`Attempting to download image from: ${pageImageUrl}`);
                const imageRes = await fetch(pageImageUrl, {
                    signal: AbortSignal.timeout(10000),
                });

                if (imageRes.ok) {
                    const imageBlob = await imageRes.blob();

                    // Upload to Convex Storage
                    const uploadUrl = await ctx.runMutation(api.recipes.generateImageUploadUrl);
                    const uploadRes = await fetch(uploadUrl, {
                        method: "POST",
                        headers: { "Content-Type": imageBlob.type },
                        body: imageBlob,
                    });

                    if (uploadRes.ok) {
                        const { storageId } = await uploadRes.json();
                        imageStorageId = storageId;
                        console.log("Successfully stored page image.");
                    }
                }
            } catch (err) {
                console.warn("Page image download failed, falling back to Pollinations:", err);
            }
        }

        // Fallback: Generate Pollinations Image if no page image
        if (!imageStorageId) {
            try {
                // Extract core keywords from title (remove common stopwords)
                const stopwords = ["nach", "mit", "aus", "vom", "von", "zu", "für", "in", "an", "auf", "bei", "durch", "original", "originalrezept", "rezept", "klassisch", "traditionell", "einfach", "schnell", "lecker"];
                const titleWords = (recipeData.title || "Delicious Food")
                    .toLowerCase()
                    .split(/\s+/)
                    .filter((word: string) => !stopwords.includes(word) && word.length > 2)
                    .slice(0, 3) // max 3 keywords
                    .join(" ");

                const safeTitle = encodeURIComponent(titleWords || "Delicious Food");
                const pollinationsUrl = `https://image.pollinations.ai/prompt/realistic%20food%20photography%20${safeTitle}?width=1080&height=1080&nologo=true`;

                console.log(`Fetching Pollinations image: ${pollinationsUrl}`);
                const pollRes = await fetch(pollinationsUrl, {
                    signal: AbortSignal.timeout(10000),
                });

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
                        console.log("Successfully stored Pollinations image.");
                    }
                }
            } catch (pollErr) {
                console.error("Pollinations fallback also failed:", pollErr);
                // If both fail, we keep the original URL (or empty)
            }
        }

        // ============================================================
        // 5. Save Recipe (sourceUrl gesetzt = link_imports Counter!)
        // ============================================================
        try {
            const newRecipeId = await ctx.runMutation(api.recipes.create, {
                title: recipeData.title || "Rezept von Website",
                category: recipeData.category || "Sonstiges",
                prepTimeMinutes: recipeData.prepTimeMinutes || 30,
                difficulty: recipeData.difficulty || "Mittel",
                portions: recipeData.portions || 4,
                ingredients: recipeData.ingredients || [],
                instructions: recipeData.instructions || [],
                image: finalImageUrl,
                imageStorageId: imageStorageId,
                sourceImageUrl: pageImageUrl,
                sourceUrl: args.url,
                imageAlt: recipeData.title,
                isFavorite: false,
            });

            return newRecipeId;

        } catch (createError: any) {
            // Limit reached Error weiterwerfen
            const errStr = createError.message || "";
            if (errStr.includes("LIMIT_REACHED")) {
                throw createError;
            }
            throw new Error("Fehler beim Speichern des Rezepts.");
        }
    },
});
