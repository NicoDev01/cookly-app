/**
 * Prompt-Vorlagen für den Social-Import. Bewusst in einer eigenen Datei:
 * Prompts werden am häufigsten angefasst und sollen ohne Pipeline-Kontext lesbar sein.
 */

export type PromptOptions = {
  /** Anzeigename der Plattform, z. B. "Instagram". */
  label: string;
  /** Beschreibt dem Modell, was für ein Text ankommt. */
  sourceDescription: string;
  /** Zusätzliche plattformspezifische Hinweise (z. B. ASR-Fehler bei TikTok). */
  notes?: readonly string[];
};

const COMMON_RULES = [
  "Gib Titel, Zutaten und Zubereitung IMMER auf Deutsch aus, auch wenn der Quelltext eine andere Sprache hat.",
  "Kürze nicht aggressiv. Erhalte alle essenziellen Informationen (Mengen, Zeiten, Temperaturen, Reihenfolge, Hinweise).",
  "Strukturiere die Zubereitung in klare Einzelschritte; lieber mehr präzise Schritte als wenige zusammengefasste.",
  "Jeder Schritt MUSS ein passendes Material-Symbol-Icon enthalten.",
  'Nur "imageKeywords" bleibt auf Englisch.',
] as const;

const RESPONSE_FORMAT = `
  Format:
  {
    "title": "Name des Gerichts (aus dem Text oder erfinde einen passenden)",
    "category": "Eine der folgenden Kategorien (NUR eine davon wählen): Pasta, Salat, Suppe, Fleisch, Fisch, Vegetarisch, Vegan, Backen, Dessert, Frühstück, Snack, Beilage, Getränke, Sonstiges",
    "prepTimeMinutes": Zahl (geschätzt wenn nicht angegeben),
    "difficulty": "Einfach" | "Mittel" | "Schwer",
    "portions": Zahl (Standard 2 wenn nicht angegeben),
    "ingredients": [{"name": "Zutat", "amount": "Menge"}],
    "instructions": [{"text": "Detaillierte Schrittbeschreibung auf Deutsch", "icon": "passendes Material Symbol Icon (snake_case)"}],
    "imageKeywords": "Kurze englische Beschreibung für Bildsuche"
  }

  Wähle für die Icons passende Material Symbols aus (z.B. outdoor_grill, timer, restaurant, blender, oven_gen, skillet, cookie, local_pizza, set_meal, soup_kitchen, flatware, egg, kitchen, microwave).
  Antworte NUR mit dem JSON.
`;

const bulletList = (entries: readonly string[]) => entries.map((entry) => `  - ${entry}`).join("\n");

export const buildExtractionPrompt = (options: PromptOptions, text: string): string => `
  Extrahiere aus ${options.sourceDescription} ein strukturiertes Rezept:
  - Titel (erste Zeile oder Zusammenfassung)
  - Zutaten (Liste)
  - Zubereitung (Schritte)
  - Quelle: ${options.label} Post
${bulletList([...COMMON_RULES, ...(options.notes ?? [])])}

  Text:
  ${text}
${RESPONSE_FORMAT}`;

export const buildRecoveryPrompt = (options: PromptOptions, text: string): string => `
  Du bekommst einen eher kurzen oder unstrukturierten Text von ${options.label}.
  Extrahiere trotzdem ein brauchbares, detailliertes Kochrezept.
  Wenn Mengen fehlen, schätze sinnvolle Mengen konservativ.
${bulletList([...COMMON_RULES, ...(options.notes ?? [])])}

  Text:
  ${text}
${RESPONSE_FORMAT}`;
