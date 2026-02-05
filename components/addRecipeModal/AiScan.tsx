import React from "react";
import { GoogleGenAI } from "@google/genai";
import { sanitizeInstructionsIcons } from "../../utils/iconUtils";

// Inlined: Pollinations URL builder for AI scan fallback images
function buildAiScanImageUrl(keywords: string, seed?: number): string {
  const cleaned = keywords
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const encoded = encodeURIComponent(`realistic food photography ${cleaned}`);
  const seedParam = seed ?? Math.floor(Math.random() * 1000000000);

  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=klein&nologo=true&seed=${seedParam}`;
}

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
  difficulty: string;
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
    "category": "Eine passende Kategorie (z.B. Pasta, Salat, Dessert)",
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

export const createGeminiClient = (apiKey: string) => {
  if (!apiKey) throw new Error("VITE_GEMINI_API_KEY fehlt in der .env Datei");
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  return { ai, model };
};

const compressImageForAi = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const maxDim = 2048; // Safe limit for OCR (keeps text readable)

        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width *= scale;
          height *= scale;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        // White background for transparent PNGs
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG 0.90 is safe for text, reduces size significantly
        resolve(canvas.toDataURL("image/jpeg", 0.90));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const parseGeminiJson = (text?: string) => {
  const jsonStr = text?.replace(/```json/g, "").replace(/```/g, "").trim();
  if (!jsonStr) throw new Error("Leere Antwort von Gemini");
  return JSON.parse(jsonStr);
};

const cleanIngredients = (
  value: Array<{ name?: string; amount?: string }> | undefined
): Array<{ name: string; amount?: string }> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((i) => ({
      name: String(i?.name ?? "").trim(),
      amount: String(i?.amount ?? "").trim() || undefined,
    }))
    .filter((i) => i.name.length > 0);
};

const cleanInstructions = (
  value: Array<{ text?: string; icon?: string }> | undefined
): Array<{ text: string; icon?: string }> => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((s) => ({
      text: String(s?.text ?? "").trim(),
      icon: String(s?.icon ?? "").trim() || undefined,
    }))
    .filter((s) => s.text.length > 0);
  return sanitizeInstructionsIcons(normalized);
};

export const analyzeRecipePhoto = async (args: {
  ai: GoogleGenAI;
  model: string;
  file: File;
  fallback: AiScanFallback;
  prompt?: string;
}): Promise<{ base64: string; doc: AiScanDoc }> => {
  const { ai, model, file, fallback } = args;
  const prompt = (args.prompt ?? AI_SCAN_PROMPT_FIXED).trim();

  const base64 = await compressImageForAi(file);
  const base64Data = base64.split(",")[1];
  const mimeType = "image/jpeg";

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }],
    },
  });

  const data = parseGeminiJson(response.text);

  const nextImage = data.imageKeywords
    ? buildAiScanImageUrl(String(data.imageKeywords))
    : fallback.image;

  const title = (data.title ?? "").trim() || fallback.title;

  return {
    base64,
    doc: {
      title,
      category: (data.category ?? "").trim() || fallback.category,
      prepTimeMinutes: Number(data.prepTimeMinutes) || fallback.prepTimeMinutes,
      difficulty: data.difficulty || fallback.difficulty,
      portions: Number(data.portions) || fallback.portions,
      ingredients: cleanIngredients(data.ingredients),
      instructions: cleanInstructions(data.instructions),
      image: nextImage,
      imageAlt: title || fallback.imageAlt,
    },
  };
};

type AiScanPanelProps = {
  editAfterScan: boolean;
  setEditAfterScan: (next: boolean) => void;

  isBusy: boolean;
  isBulkAnalyzing: boolean;
  bulkTotal: number;
  bulkProcessed: number;
  bulkErrors: number;
  isAnalyzing: boolean;

  // New: Progress states
  analysisStage: 'idle' | 'uploading' | 'analyzing' | 'processing' | 'complete';
  analysisProgress: number;

  sourceImageUrl: string;

  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export const AiScanPanel: React.FC<AiScanPanelProps> = ({
  editAfterScan,
  setEditAfterScan,
  isBusy,
  isBulkAnalyzing,
  bulkTotal,
  bulkProcessed,
  bulkErrors,
  isAnalyzing,
  analysisStage,
  analysisProgress,
  sourceImageUrl,
  fileInputRef,
  onFileChange,
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full space-y-6 py-10">
      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <input
          type="checkbox"
          checked={editAfterScan}
          onChange={(e) => setEditAfterScan(e.target.checked)}
          disabled={isBusy || isBulkAnalyzing || bulkTotal > 1}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        nach Scan direkt bearbeiten
      </label>

      <div
        onClick={() => fileInputRef.current?.click()}
        className="w-full max-w-sm aspect-video border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group"
      >
        {sourceImageUrl ? (
          <img src={sourceImageUrl} className="w-full h-full object-cover rounded-xl" />
        ) : (
          <>
            <span className="material-symbols-outlined text-4xl text-gray-400 group-hover:text-primary mb-2">
              add_a_photo
            </span>
            <span className="text-gray-500 dark:text-gray-400 font-medium">Foto hochladen</span>
          </>
        )}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          multiple
          onChange={onFileChange}
        />
      </div>

      {!isBulkAnalyzing && (
        <p className="text-xs text-gray-400 text-center max-w-xs">
          Du kannst auch mehrere Fotos auf einmal auswählen.
        </p>
      )}

      {isBulkAnalyzing && (
        <div className="text-center space-y-2">
          <div className="animate-spin text-primary text-2xl">⏳</div>
          <p className="text-gray-500 dark:text-gray-400">
            {bulkProcessed} / {bulkTotal} verarbeitet (
            {bulkTotal > 0 ? Math.round((bulkProcessed / bulkTotal) * 100) : 0}%)
          </p>
          {bulkErrors > 0 && <p className="text-xs text-gray-400">Fehler: {bulkErrors}</p>}
        </div>
      )}

      {isAnalyzing && (
        <div className="w-full max-w-sm space-y-3">
          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 min-w-[3rem] text-right">
              {analysisProgress}%
            </span>
          </div>

          {/* Stage Text */}
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            {analysisStage === 'uploading' && '📤 Bild wird vorbereitet...'}
            {analysisStage === 'analyzing' && '🤖 KI analysiert Rezept...'}
            {analysisStage === 'processing' && '⚙️ Rezept wird erstellt...'}
            {analysisStage === 'complete' && '✅ Fertig!'}
          </p>

          {/* Animated Icon */}
          <div className="flex justify-center">
            {analysisStage === 'analyzing' && (
              <div className="animate-pulse text-3xl">🧠</div>
            )}
            {analysisStage === 'uploading' && (
              <div className="animate-bounce text-3xl">📷</div>
            )}
            {analysisStage === 'processing' && (
              <div className="animate-spin text-3xl">⚙️</div>
            )}
            {analysisStage === 'complete' && (
              <div className="text-3xl">✨</div>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center max-w-xs">
        Lade ein Foto von einem Kochbuch oder handgeschriebenen Zettel hoch. Die KI füllt das
        Formular automatisch aus.
      </p>
    </div>
  );
};
