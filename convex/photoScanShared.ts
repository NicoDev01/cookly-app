import { RECIPE_CATEGORIES } from "./constants";
import { sanitizeInstructionsIcons } from "../utils/iconUtils";

export type AiScanFallback = {
  title: string;
  category: string;
  prepTimeMinutes: number;
  difficulty: string;
  portions: number;
  image: string;
  imageAlt: string;
};

export type AiScanDoc = {
  title: string;
  category: string;
  prepTimeMinutes: number;
  difficulty: "Einfach" | "Mittel" | "Schwer";
  portions: number;
  ingredients: Array<{ name: string; amount?: string }>;
  instructions: Array<{ text: string; icon?: string }>;
  image: string;
  imageAlt: string;
};

export const AI_SCAN_PROMPT_FIXED = `
  Analysiere dieses Rezeptbild. Extrahiere die Daten und gib sie als JSON zurück.
  Format:
  {
    "title": "Name des Gerichts",
    "category": "Eine der folgenden Kategorien (NUR eine davon wählen): Pasta, Salat, Suppe, Fleisch, Fisch, Vegetarisch, Vegan, Backen, Dessert, Frühstück, Snack, Beilage, Getränke, Sonstiges",
    "prepTimeMinutes": Zahl (geschätzt oder gelesen),
    "difficulty": "Einfach" | "Mittel" | "Schwer",
    "portions": Zahl,
    "ingredients": [{"name": "Zutat", "amount": "Menge"}],
    "instructions": [{"text": "Schrittbeschreibung", "icon": "passendes Material Symbol Icon (snake_case)"}],
    "imageKeywords": "Kurze englische Beschreibung für Bildsuche (z.B. 'spaghetti bolognese', 'chocolate cake')"
  }
  Wähle für die Icons passende Material Symbols aus, z.B.:
  outdoor_grill, local_fire_department, water_drop, timer, restaurant, blender, oven_gen, skillet, grid_on, cookie, cake, local_pizza, set_meal, soup_kitchen, flatware, egg, breakfast_dining, brunch_dining, dinner_dining, lunch_dining, ramen_dining, bakery_dining, kitchen, microwave.
  Nutze NUR Icons, die in Material Symbols (Outlined) existieren und am besten aus der obigen Liste. Wenn unsicher, lass "icon" weg.
  Antworte NUR mit dem JSON.
`;

const DIFFICULTIES = new Set(["Einfach", "Mittel", "Schwer"]);

export const buildAiScanImageUrl = (keywords: string, seed?: number): string => {
  const cleaned = keywords
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const encoded = encodeURIComponent(`realistic food photography ${cleaned}`);
  const seedParam = seed ?? Math.floor(Math.random() * 1000000000);

  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=klein&nologo=true&seed=${seedParam}`;
};

export const parseGeminiJson = (text?: string): Record<string, unknown> => {
  const jsonStr = text?.replace(/```json/g, "").replace(/```/g, "").trim();
  if (!jsonStr) throw new Error("Leere Antwort von Gemini");
  const parsed = JSON.parse(jsonStr) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Gemini lieferte kein JSON-Objekt");
  }
  return parsed as Record<string, unknown>;
};

const readString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const readNumber = (value: unknown): number | undefined => {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const readItems = (value: unknown): Array<Record<string, unknown>> => {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => {
        return typeof item === "object" && item !== null && !Array.isArray(item);
      })
    : [];
};

const cleanIngredients = (
  value: unknown
): Array<{ name: string; amount?: string }> => {
  return readItems(value)
    .map((i) => ({
      name: readString(i.name),
      amount: readString(i.amount) || undefined,
    }))
    .filter((i) => i.name.length > 0);
};

const cleanInstructions = (
  value: unknown
): Array<{ text: string; icon?: string }> => {
  const normalized = readItems(value)
    .map((s) => ({
      text: readString(s.text),
      icon: readString(s.icon) || undefined,
    }))
    .filter((s) => s.text.length > 0);
  return sanitizeInstructionsIcons(normalized);
};

export const normalizeAiScanResult = (
  data: Record<string, unknown>,
  fallback: AiScanFallback
): AiScanDoc => {
  const title = readString(data.title) || fallback.title;
  const rawCategory = readString(data.category);
  const category = (RECIPE_CATEGORIES as readonly string[]).includes(rawCategory)
    ? rawCategory
    : fallback.category;
  const rawDifficulty = readString(data.difficulty);
  const difficulty = DIFFICULTIES.has(rawDifficulty)
    ? (rawDifficulty as "Einfach" | "Mittel" | "Schwer")
    : (fallback.difficulty as "Einfach" | "Mittel" | "Schwer");
  const imageKeywords = readString(data.imageKeywords);

  return {
    title,
    category,
    prepTimeMinutes: readNumber(data.prepTimeMinutes) || fallback.prepTimeMinutes,
    difficulty,
    portions: readNumber(data.portions) || fallback.portions,
    ingredients: cleanIngredients(data.ingredients),
    instructions: cleanInstructions(data.instructions),
    image: imageKeywords ? buildAiScanImageUrl(imageKeywords) : fallback.image,
    imageAlt: title || fallback.imageAlt,
  };
};

export const AI_SCAN_RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["title", "category", "prepTimeMinutes", "difficulty", "portions", "ingredients", "instructions"],
  properties: {
    title: { type: "string" },
    category: { type: "string", enum: RECIPE_CATEGORIES },
    prepTimeMinutes: { type: "number" },
    difficulty: { type: "string", enum: ["Einfach", "Mittel", "Schwer"] },
    portions: { type: "number" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          amount: { type: "string" },
        },
      },
    },
    instructions: {
      type: "array",
      items: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string" },
          icon: { type: "string" },
        },
      },
    },
    imageKeywords: { type: "string" },
  },
} as const;
