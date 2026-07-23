"use node";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODELS, RECIPE_CATEGORIES } from "./constants";
import { createImportTimer } from "./importTiming";
import { runLegacyImport } from "./legacyImport";
import { isRetryableGeminiError, runWithGeminiRetry } from "../utils/geminiRetry";

const JINA_API_KEY = process.env.JINA_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

interface ExtractedRecipe {
    title: string;
    category: string;
    prepTimeMinutes: number;
    difficulty: "Einfach" | "Mittel" | "Schwer";
    portions: number;
    ingredients: Array<{ name: string; amount: string }>;
    instructions: Array<{ text: string; icon?: string }>;
    imageKeywords?: string;
}

const parseRecipe = (value: string): ExtractedRecipe => {
    const raw = JSON.parse(value.replace(/```json/g, "").replace(/```/g, "").trim()) as Partial<ExtractedRecipe>;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const ingredients = Array.isArray(raw.ingredients)
        ? raw.ingredients
            .filter((item) => typeof item?.name === "string" && item.name.trim())
            .map((item) => ({
                name: item.name.trim(),
                amount: typeof item.amount === "string" ? item.amount.trim() : "",
            }))
        : [];
    const instructions = Array.isArray(raw.instructions)
        ? raw.instructions
            .filter((item) => typeof item?.text === "string" && item.text.trim())
            .map((item) => ({
                text: item.text.trim(),
                ...(typeof item.icon === "string" && item.icon.trim() ? { icon: item.icon.trim() } : {}),
            }))
        : [];
    if (!title || !ingredients.length || !instructions.length) {
        throw new Error("INCOMPLETE_RECIPE");
    }
    const prepTimeMinutes = Number(raw.prepTimeMinutes);
    const portions = Number(raw.portions);
    return {
        title,
        category: (RECIPE_CATEGORIES as readonly string[]).includes(raw.category ?? "")
            ? raw.category!
            : "Sonstiges",
        prepTimeMinutes: Number.isFinite(prepTimeMinutes) && prepTimeMinutes > 0
            ? Math.round(prepTimeMinutes)
            : 30,
        difficulty: ["Einfach", "Mittel", "Schwer"].includes(raw.difficulty ?? "")
            ? raw.difficulty!
            : "Mittel",
        portions: Number.isFinite(portions) && portions > 0 ? Math.round(portions) : 4,
        ingredients,
        instructions,
        imageKeywords: typeof raw.imageKeywords === "string" ? raw.imageKeywords.trim() : undefined,
    };
};


const WEBSITE_RECIPE_PROMPT = `
Extrahiere aus diesem Rezept-Inhalt ein strukturiertes Rezept.

Seitentitel: {{TITLE}}

Inhalt (Markdown):
{{MARKDOWN}}

Format:
{
  "title": "Rezeptname (nutze den Seitentitel als Basis, falls sinnvoll)",
  "category": "Eine der folgenden Kategorien (NUR eine davon wählen): Pasta, Salat, Suppe, Fleisch, Fisch, Vegetarisch, Vegan, Backen, Dessert, Frühstück, Snack, Beilage, Getränke, Sonstiges",
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
  handler: (ctx, args): Promise<Id<"recipes">> => runLegacyImport(ctx, "website", args.url),
});

export const scrapeWebsiteInternal = internalAction({
    args: { userId: v.id("users"), url: v.string() },
    handler: async (ctx, args) => {
        const timer = createImportTimer("website", { url: args.url });
        if (!JINA_API_KEY) throw new Error("JINA_API_KEY is missing in Convex Environment Variables");
        if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is missing in Convex Environment Variables");
        timer.mark("env_checked");

        timer.mark("authenticated");
        timer.mark("rate_limit_checked");

        // Check if we already have this recipe to save costs and time
        const existing = await ctx.runQuery(internal.recipes.getBySourceUrlForUser, { userId: args.userId, url: args.url });
        if (existing) {
            console.log(`Recipe already exists for ${args.url}, returning existing ID.`);
            timer.mark("dedupe_hit");
            timer.summary({ result: "existing_recipe" });
            return { recipeId: existing._id };
        }
        timer.mark("dedupe_miss");

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
            
            // ============================================================
            // Bild-Extraktion mit mehreren Fallbacks
            // 1. Jina-eigenes Images-Array
            // 2. OpenGraph/Twitter Metadaten aus dem Metadata-Objekt
            // 3. Flache Metadaten-Felder (thumbnail, image, ogImage)
            // 4. Regex-Extraktion aus dem Markdown
            // ============================================================
            const metadata = jinaData.data.metadata || {};
            pageImageUrl = jinaData.data.images?.[0] || "";

            if (!pageImageUrl) {
                // Brackets für Felder mit Doppelpunkt (og:image)
                pageImageUrl = 
                    metadata["og:image"] || 
                    metadata["og:image:secure_url"] || 
                    metadata["twitter:image"] ||
                    jinaData.data.image || 
                    jinaData.data.thumbnail || 
                    jinaData.data.ogImage || "";
            }

            if (!pageImageUrl && markdown) {
                // Sucht nach dem ersten Markdown-Bild: ![alt](url)
                const imageMatch = markdown.match(/!\[.*?\]\((https?:\/\/[^)\s]+)\)/);
                if (imageMatch && imageMatch[1]) {
                    pageImageUrl = imageMatch[1];
                    console.log(`Image extracted via Regex from Markdown: ${pageImageUrl}`);
                }
            }

            console.log(`Extracted content. Title: "${pageTitle}", Image: "${pageImageUrl ? 'found' : 'missing'}", Markdown length: ${markdown.length} chars`);
            timer.mark("jina_extracted", { markdownLength: markdown.length, hasPageImage: !!pageImageUrl });

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
        timer.mark("markdown_truncated", { truncatedLength: truncatedMarkdown.length });

        // ============================================================
        // 4. Parse with Gemini mit Graceful Degradation
        // ============================================================
        let recipeData: ExtractedRecipe;

        try {
            const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
            const prompt = WEBSITE_RECIPE_PROMPT
                .replace("{{TITLE}}", pageTitle)
                .replace("{{MARKDOWN}}", truncatedMarkdown);

            const result = await runWithGeminiRetry(() =>
                ai.models.generateContent({
                    model: GEMINI_MODELS.recipeTextExtraction,
                    contents: prompt,
                })
            );

            const responseText = result.text || "";

            if (!responseText) {
                throw new Error("Gemini returned empty response");
            }

            recipeData = parseRecipe(responseText);
            timer.mark("gemini_parsed", { hasIngredients: !!recipeData.ingredients?.length, hasInstructions: !!recipeData.instructions?.length });

        } catch (geminiError) {
            console.error("Gemini error:", geminiError);
            timer.mark("gemini_failed");
            throw new Error(JSON.stringify({
                type: isRetryableGeminiError(geminiError) ? "API_UNAVAILABLE" : "NO_RECIPE_CONTENT",
                service: "gemini",
                fallbackMode: "manual",
                prefillUrl: args.url,
                message: isRetryableGeminiError(geminiError)
                    ? "Die Rezeptanalyse ist gerade nicht verfügbar. Bitte versuche es gleich erneut."
                    : "Auf der Website wurde kein vollständiges Rezept mit Zutaten und Zubereitung gefunden.",
            }));
        }

        // 4. Select initial image URL fast; storage proxying happens async after import
        const stopwords = ["nach", "mit", "aus", "vom", "von", "zu", "für", "in", "an", "auf", "bei", "durch", "original", "originalrezept", "rezept", "klassisch", "traditionell", "einfach", "schnell", "lecker"];
        const titleWords = (recipeData.title || "Delicious Food")
            .toLowerCase()
            .split(/\s+/)
            .filter((word: string) => !stopwords.includes(word) && word.length > 2)
            .slice(0, 3)
            .join(" ");
        const safeTitle = encodeURIComponent(titleWords || "Delicious Food");
        const pollinationsUrl = `https://image.pollinations.ai/prompt/realistic%20food%20photography%20${safeTitle}?width=1024&height=1024&model=klein&nologo=true`;
        const finalImageUrl = pageImageUrl || pollinationsUrl;
        timer.mark("image_url_selected", { usedPageImage: !!pageImageUrl });

        const payload = {
                title: recipeData.title || "Rezept von Website",
                category: recipeData.category || "Sonstiges",
                prepTimeMinutes: recipeData.prepTimeMinutes || 30,
                difficulty: recipeData.difficulty || "Mittel",
                portions: recipeData.portions || 4,
                ingredients: recipeData.ingredients || [],
                instructions: recipeData.instructions || [],
                image: finalImageUrl,
                sourceImageUrl: finalImageUrl,
                sourceUrl: args.url,
                imageAlt: recipeData.title,
                isFavorite: false,
        } as const;
        return { payload };
    },
});
