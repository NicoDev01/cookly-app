import type { ImportProvider } from './importTarget';

/**
 * Fortschritt der Import-Seite. Die Schritte folgen den Backend-Phasen von importOperations:
 * reserved → detect, running → scrape, phase "extracting" → extract, succeeded → save (Rezept wird eingeblendet).
 * Innerhalb eines Schritts ist der Wert geschätzt (p50 je Quelle, Nov. 2026).
 */
export type ImportStepId = 'detect' | 'scrape' | 'extract' | 'save';

export const IMPORT_STEP_ORDER: ImportStepId[] = ['detect', 'scrape', 'extract', 'save'];

/**
 * Balken-Ziel je Schritt in Prozent. Bewusst vorne schwer: Die ersten ~75 % laufen zügig durch (Laden des Beitrags),
 * das fühlt sich schneller an als ein gleichmäßiger Balken; der Rest wartet ehrlich auf Gemini.
 */
export const IMPORT_STEP_TARGET: Record<ImportStepId, number> = { detect: 15, scrape: 82, extract: 97, save: 100 };

export const importStepTitle = (step: ImportStepId, provider: ImportProvider) => {
  if (step === 'detect') return 'Link erkannt';
  if (step === 'scrape') return provider === 'website' ? 'Webseite wird gelesen' : 'Beitrag wird geladen';
  if (step === 'extract') return 'Rezept wird erkannt';
  return 'Wird gespeichert';
};

export const expectedImportStepMs = (step: ImportStepId, provider: ImportProvider) => {
  if (step === 'detect') return 400;
  if (step === 'scrape') return provider === 'website' ? 2_000 : 7_500;
  if (step === 'extract') return 3_000;
  return 1_500;
};

type OperationSnapshot = { status: string; phase?: string | null } | null | undefined;

export const importStepFromOperation = (operation: OperationSnapshot): ImportStepId => {
  if (!operation || operation.status === 'reserved') return 'detect';
  if (operation.status === 'succeeded') return 'save';
  return operation.phase === 'extracting' ? 'extract' : 'scrape';
};

/**
 * Nähert sich `to` von `base` aus asymptotisch an (höchstens 90 % des Rests).
 * So steht der Balken bei einem langsamen Schritt ehrlich still, statt bei 100 % zu warten,
 * und springt beim Schrittwechsel nicht.
 */
export const approachPercent = (base: number, to: number, elapsedMs: number, expectedMs: number) => {
  const frac = 0.9 * (1 - Math.exp(-Math.max(0, elapsedMs) / (Math.max(1, expectedMs) * 0.4)));
  return base + (Math.max(base, to) - base) * frac;
};
