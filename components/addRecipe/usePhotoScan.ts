import { useRef, useState } from 'react';
import { useConvex, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { compressImage, getImageDimensionsFromBlob, uploadJpegToConvexStorage } from '../addRecipeModal/recipeImage';
import { createRecipeFormData } from '../addRecipeModal/recipeForm';
import { encodeImageToBlurhash } from '../../utils/blurhash';
import { waitForImport } from '../../utils/importOperationClient';
import { getStructuredUserError } from '../../utils/userErrors';
import { getAiScanErrorMessage } from '../../utils/geminiRetry';
import { createUuid } from '../../utils/uuid';
import { logger } from '../../utils/logger';
import { capture } from '../../services/analytics';

export type ScanLimit = { feature: 'manual_recipes' | 'link_imports' | 'photo_scans'; current: number; limit: number };
export type ScanProgress =
  | { kind: 'one'; stage: 'upload' | 'read' }
  | { kind: 'many'; done: number; total: number };
type DishImage = { storageId: Id<'_storage'>; width?: number; height?: number; aspectRatio?: number; blurhash?: string };

/**
 * Foto-Scan aus dem Plus-Sheet. Ein Rezept: alle Seiten gehen in einen Scan (importOperations.startImport mit
 * extraAssetIds), ein Gerichtsfoto wird als echtes Rezeptbild hochgeladen. Mehrere Rezepte: je Foto ein Scan.
 * Der Server legt das Rezept selbst an (saveRecipe), auch wenn die App während des Scans geschlossen wird.
 * `onSaved` bekommt die ID des (letzten) Rezepts.
 */
export function usePhotoScan(onSaved: (recipeId: Id<'recipes'>, message?: { text: string; tone: 'success' | 'info' }, count?: number) => void) {
  const convex = useConvex();
  const generateUploadUrl = useMutation(api.storageAssets.generateUploadUrl);
  const registerUploadedAsset = useMutation(api.storageAssets.registerUploadedAsset);
  const releasePendingAsset = useMutation(api.storageAssets.releasePendingAsset);
  const startImport = useMutation(api.importOperations.startImport);

  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<ScanLimit | null>(null);
  const busyRef = useRef(false);

  const upload = async (blob: Blob, purpose: 'photo_scan' | 'recipe_image') => {
    const uploadUrl = await generateUploadUrl({ purpose });
    const json = await uploadJpegToConvexStorage(uploadUrl, blob);
    const storageId = json.storageId as Id<'_storage'>;
    await registerUploadedAsset({ storageId, purpose });
    return storageId;
  };

  const uploadPage = async (file: File) => upload(await compressImage(file, 2048, 0.9, 'image/jpeg'), 'photo_scan');

  /** Gerichtsfoto wie im Formular: 1200 px, Maße und Blurhash vorab, damit die Rezeptseite nicht springt. */
  const uploadDish = async (file: File): Promise<DishImage> => {
    const compressed = await compressImage(file, 1200, 0.75, 'image/jpeg');
    const meta = await getImageDimensionsFromBlob(compressed).catch(() => null);
    const preview = URL.createObjectURL(compressed);
    const blurhash = await encodeImageToBlurhash(preview).catch(() => undefined);
    URL.revokeObjectURL(preview);
    return {
      storageId: await upload(compressed, 'recipe_image'),
      width: meta?.width,
      height: meta?.height,
      aspectRatio: meta?.aspectRatio,
      blurhash: blurhash ?? undefined,
    };
  };

  /** Startet den Scan; `onStarted` meldet, dass der Server das Gerichtsfoto übernommen hat. */
  const scan = async (pageIds: Id<'_storage'>[], dish: DishImage | undefined, onStarted: () => void) => {
    const fallback = createRecipeFormData(null, '');
    const started = await startImport({
      operationId: createUuid(),
      provider: 'photo_scan',
      sourceAssetId: pageIds[0],
      ...(pageIds.length > 1 ? { extraAssetIds: pageIds.slice(1) } : {}),
      saveRecipe: true,
      ...(dish ? { dishImage: dish } : {}),
      input: {
        title: fallback.title,
        category: fallback.category,
        prepTimeMinutes: fallback.prepTimeMinutes,
        difficulty: fallback.difficulty,
        portions: fallback.portions,
        image: fallback.image,
        imageAlt: fallback.imageAlt,
      },
    });
    onStarted();
    const operation = await waitForImport(convex, started.operationId);
    if (!operation.resultRecipeId) throw new Error('IMPORT_RESULT_MISSING');
    capture('recipe_saved', { correlationId: started.operationId, source: 'photo_scan' });
    return operation.resultRecipeId;
  };

  /** true, wenn der Fehler behandelt ist und ein weiterer Versuch nichts bringt (Limit). */
  const fail = (err: unknown) => {
    const data = getStructuredUserError(err);
    if (data?.type === 'LIMIT_REACHED' && data.feature && typeof data.current === 'number' && typeof data.limit === 'number') {
      setLimit({ feature: data.feature as ScanLimit['feature'], current: data.current, limit: data.limit });
      return true;
    }
    if (data?.type === 'RATE_LIMIT_EXCEEDED') setError('Zu viele Foto-Scans. Bitte warte einen Moment.');
    // Stimmt jetzt wirklich: Der Server speichert das Rezept auch ohne die App.
    else if (data?.type === 'IMPORT_TIMEOUT') setError('Das dauert länger als gedacht. Das Rezept erscheint gleich in deiner Sammlung.');
    else if (data?.type === 'API_UNAVAILABLE') setError('Die KI ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.');
    // Fehlercode der Import-Operation (z. B. IMPORT_FAILED): nie rohes JSON zeigen.
    else if (data?.type) setError('Das Rezept konnte nicht gelesen werden. Versuche es mit einem schärferen Foto oder später noch einmal.');
    else setError(getAiScanErrorMessage(err));
    return false;
  };

  const run = async (job: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    try {
      await job();
    } finally {
      busyRef.current = false;
      setProgress(null);
    }
  };

  /** Ein Rezept aus 1–3 Seiten, optional mit Foto vom fertigen Gericht. */
  const scanOne = (pages: File[], dishFile: File | null) => run(async () => {
    let dish: DishImage | undefined;
    let handedOver = false;
    try {
      setProgress({ kind: 'one', stage: 'upload' });
      const [pageIds, dishImage] = await Promise.all([
        Promise.all(pages.map(uploadPage)),
        dishFile ? uploadDish(dishFile) : Promise.resolve(undefined),
      ]);
      dish = dishImage;
      setProgress({ kind: 'one', stage: 'read' });
      onSaved(await scan(pageIds, dish, () => { handedOver = true; }));
    } catch (err) {
      // Nur freigeben, solange der Server das Foto nicht übernommen hat; danach räumt er selbst auf.
      if (dish && !handedOver) void releasePendingAsset({ storageId: dish.storageId }).catch(() => undefined);
      logger.error('PhotoScan', 'Scan failed', err);
      fail(err);
    }
  });

  /** Jedes Foto ein eigenes Rezept, nacheinander (schont Rate-Limit und Gemini-Budget). */
  const scanEach = (files: File[]) => run(async () => {
    const created: Id<'recipes'>[] = [];
    let errors = 0;
    for (const [index, file] of files.entries()) {
      setProgress({ kind: 'many', done: index, total: files.length });
      try {
        created.push(await scan([await uploadPage(file)], undefined, () => undefined));
      } catch (err) {
        logger.error('PhotoScan', 'Bulk scan failed', err);
        errors++;
        if (fail(err)) break;
      }
    }
    // Bereits erstellte Rezepte immer zeigen, auch nach Fehler oder Limit.
    if (!created.length) return;
    setError(null);
    const text = created.length < files.length
      ? `Fertig! ${created.length} von ${files.length} Rezepten wurden erstellt.`
      : created.length === 1 ? 'Rezept wurde erstellt.' : `Perfekt! ${created.length} Rezepte wurden erstellt.`;
    onSaved(created[created.length - 1], { text, tone: errors ? 'info' : 'success' }, created.length);
  });

  return {
    progress,
    error,
    limit,
    scanOne,
    scanEach,
    clearError: () => setError(null),
    clearLimit: () => setLimit(null),
  };
}
