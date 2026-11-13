import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useAction } from "convex/react";
import { X } from 'lucide-react';
import { api } from "../convex/_generated/api";
import { Recipe } from '../types';
import { Id } from "../convex/_generated/dataModel";
import { sanitizeInstructionsIcons } from '../utils/iconUtils';
import {
  compressImage,
  uploadJpegToConvexStorage,
  getImageDimensionsFromBlob,
  getImageDimensionsFromUrl,
  type ImageDimensions,
} from './addRecipeModal/recipeImage';
import { encodeImageToBlurhash } from '../utils/blurhash';
import { getUserErrorMessage } from '../utils/userErrors';
import ManualRecipeForm, { type ManualFormData } from './addRecipeModal/ManualRecipeForm';
import UpgradeModal from './UpgradeModal';
import { useModal } from '../contexts/ModalContext';
import { logger } from '../utils/logger';
import { createUuid } from '../utils/uuid';
import { capture, withCorrelation } from '../services/analytics';
import { createRecipeFormData, PLACEHOLDER_RECIPE_IMAGE } from './addRecipeModal/recipeForm';
import { prefersReducedMotion, SHEET_OUT_MS } from './addRecipe/motion';

interface AddRecipeModalProps {
  isOpen: boolean;
  /** Nach dem Speichern (und ohne `onCancel` auch beim Abbrechen). */
  onClose: () => void;
  /** Abbrechen/Schließen ohne Speichern, z. B. zurück zur Auswahl im Plus-Sheet. */
  onCancel?: () => void;
  initialData?: Recipe | null; // Optional: Wenn gesetzt, sind wir im Edit-Mode
}

type UpgradeFeature = 'manual_recipes' | 'link_imports' | 'photo_scans';

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
};

/**
 * Rezept selbst schreiben oder bearbeiten (Foto-Scan und Link-Import laufen über components/addRecipe/AddRecipeSheet.tsx).
 * Vollbild auf grauem App-Hintergrund, Felder in weißen Karten (components/addRecipeModal/ManualRecipeForm.tsx).
 */
const AddRecipeModal: React.FC<AddRecipeModalProps> = ({ isOpen, onClose, onCancel, initialData }) => {
  const { addModalImportUrl } = useModal();
  const createRecipe = useMutation(api.recipes.create);
  const updateRecipe = useMutation(api.recipes.updateRecipe);
  const generateImageUploadUrl = useMutation(api.storageAssets.generateUploadUrl);
  const registerUploadedAsset = useMutation(api.storageAssets.registerUploadedAsset);
  const releasePendingAsset = useMutation(api.storageAssets.releasePendingAsset);
  const generateAndStoreAiImage = useAction(api.remoteImages.generateAndStoreAiImage);
  const categoryStats = useQuery(api.recipes.getCategories);
  const existingCategories = categoryStats?.categories?.map(c => c.name) || [];

  // ============================================================
  // NEU: Proaktive Limit Checks
  // ============================================================
  const canCreateManual = useQuery(api.users.canCreateManualRecipe, initialData || addModalImportUrl ? 'skip' : {});
  const canImportLink = useQuery(api.users.canImportFromLink, !initialData && addModalImportUrl ? {} : 'skip');

  const [showUpgradeModal, setShowUpgradeModal] = useState<{
    isOpen: boolean;
    feature: UpgradeFeature;
    current: number;
    limit: number;
  }>({
    isOpen: false,
    feature: 'manual_recipes',
    current: 0,
    limit: 60,
  });

  const [isUploadingRecipeImage, setIsUploadingRecipeImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNewCategoryMode, setIsNewCategoryMode] = useState(false);
  const recipeImageInputRef = useRef<HTMLInputElement>(null);

  const [isImageActionMenuOpen, setIsImageActionMenuOpen] = useState(false);
  const imageActionMenuRef = useRef<HTMLDivElement>(null);
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [aiImageGenerationStage, setAiImageGenerationStage] = useState<'idle' | 'requesting' | 'generating' | 'loading'>('idle');

  const [recipeImageStorageId, setRecipeImageStorageId] = useState<Id<"_storage"> | null>(null);
  const [recipeImagePreviewUrl, setRecipeImagePreviewUrl] = useState<string | null>(null);
  const [recipeImageBlurhash, setRecipeImageBlurhash] = useState<string | null>(null);
  const [recipeImageMeta, setRecipeImageMeta] = useState<ImageDimensions | null>(null);
  const [pendingImageBlob, setPendingImageBlob] = useState<Blob | null>(null);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);

  // Trackt ob sich das Bild geändert hat (wichtig für Update)
  const [imageChanged, setImageChanged] = useState(false);
  // Ursprüngliche Bild-Daten beim Laden speichern
  const [originalImageData, setOriginalImageData] = useState<{
    storageId: Id<"_storage"> | null;
    url: string | null;
    width?: number;
    height?: number;
    aspectRatio?: number;
  } | null>(null);

  // Ausblenden nach Abbrechen/Speichern: Formular gleitet nach unten, danach erst schließen.
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const exitWith = (done: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(done, prefersReducedMotion() ? 0 : SHEET_OUT_MS);
  };

  const handleClose = () => {
    if (recipeImageStorageId && recipeImageStorageId !== originalImageData?.storageId) {
      void releasePendingAsset({ storageId: recipeImageStorageId });
    }
    if (recipeImagePreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(recipeImagePreviewUrl);
    exitWith(onCancel ?? onClose);
  };

  useEffect(() => {
    if (!isImageActionMenuOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (imageActionMenuRef.current && !imageActionMenuRef.current.contains(target)) {
        setIsImageActionMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [isImageActionMenuOpen]);

  const openRecipeImagePicker = () => {
    if (!recipeImageInputRef.current) return;
    recipeImageInputRef.current.value = '';
    recipeImageInputRef.current.click();
  };

  const handleGenerateAiImage = async () => {
    if (isUploadingRecipeImage || isSaving) return;

    setIsGeneratingAiImage(true);
    setAiImageGenerationStage('requesting');
    setError(null);
    if (navigator.vibrate) {
      navigator.vibrate(25);
    }

    try {
      const base = (formData.title || initialData?.title || formData.category || 'recipe').trim();

      // Generate and store image server-side so provider URLs and keys never reach the client.
      setAiImageGenerationStage('generating');
      const result = await generateAndStoreAiImage({ recipeTitle: base });
      setAiImageGenerationStage('loading');

      let nextMeta: ImageDimensions | null = null;
      try {
        // Wait for image decoding once so the UI update appears instant/stable.
        nextMeta = await getImageDimensionsFromUrl(result.url);
      } catch (e) {
        logger.warn('AddRecipe', 'Could not read AI image dimensions', e);
      }

      // Clean up old preview URL
      if (recipeImagePreviewUrl) {
        URL.revokeObjectURL(recipeImagePreviewUrl);
      }

      setRecipeImageStorageId(result.storageId);
      setPendingImageBlob(null);
      setRecipeImagePreviewUrl(result.url);
      setRecipeImageMeta(nextMeta);
      setImageChanged(true); // MARKIERUNG: Bild hat geändert

      setFormData(prev => ({
        ...prev,
        image: result.url,
        imageAlt: prev.imageAlt || prev.title || base,
      }));

      // Generate blurhash in background
      encodeImageToBlurhash(result.url)
        .then(hash => setRecipeImageBlurhash(hash))
        .catch(e => logger.warn('AddRecipe', 'Could not generate blurhash', e));
      if (navigator.vibrate) {
        navigator.vibrate([20, 30, 20]);
      }

    } catch (err: unknown) {
      logger.error('AddRecipe', 'AI image generation failed', err);
      setError(getUserErrorMessage(err, 'image'));
    } finally {
      setAiImageGenerationStage('idle');
      setIsGeneratingAiImage(false);
    }
  };

  // Memory Leak Prevention: Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      if (recipeImagePreviewUrl && recipeImagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(recipeImagePreviewUrl);
      }
    };
  }, [recipeImagePreviewUrl]);

  // Form State
  const [formData, setFormData] = useState<ManualFormData>(() =>
    createRecipeFormData(initialData, addModalImportUrl || '')
  );

  // Effect: Wenn initialData sich ändert (oder Modal öffnet), Formular befüllen
  useEffect(() => {
    if (initialData) {
      setFormData(createRecipeFormData(initialData));
      setRecipeImageStorageId(initialData.imageStorageId ?? null);
      setPendingImageBlob(null);
      setRecipeImageBlurhash(initialData.imageBlurhash ?? null);
      setAiImageGenerationStage('idle');
      setRecipeImageMeta(
        initialData.imageWidth && initialData.imageHeight && initialData.imageAspectRatio
          ? {
              width: initialData.imageWidth,
              height: initialData.imageHeight,
              aspectRatio: initialData.imageAspectRatio,
            }
          : null
      );
      setRecipeImagePreviewUrl(
        initialData.image && !initialData.image.startsWith('blob:')
          ? initialData.image
          : null
      );

      // Original-Bilddaten speichern (für Change-Tracking)
      setOriginalImageData({
        storageId: initialData.imageStorageId ?? null,
        url: initialData.image ?? null,
        width: initialData.imageWidth,
        height: initialData.imageHeight,
        aspectRatio: initialData.imageAspectRatio,
      });
      setImageChanged(false);
    } else {
      // Reset für "Neues Rezept"
      setFormData(createRecipeFormData(null, addModalImportUrl || ''));
      setRecipeImageStorageId(null);
      setRecipeImagePreviewUrl(null);
      setRecipeImageBlurhash(null);
      setAiImageGenerationStage('idle');
      setRecipeImageMeta(null);
      setPendingImageBlob(null);
      setImageChanged(false);
      setOriginalImageData(null);
    }
  }, [initialData, isOpen, addModalImportUrl]);

  if (!isOpen) return null;

  const handleRecipeImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingRecipeImage(true);
    setError(null);

    try {
      const compressed = await compressImage(file, 1200, 0.75, 'image/jpeg');
      const dimensions = await getImageDimensionsFromBlob(compressed);
      setPendingImageBlob(compressed);
      setRecipeImageStorageId(null);
      setRecipeImageMeta(dimensions);

      if (recipeImagePreviewUrl) URL.revokeObjectURL(recipeImagePreviewUrl);
      const preview = URL.createObjectURL(compressed);
      setRecipeImagePreviewUrl(preview);

      setImageChanged(true); // MARKIERUNG: Bild hat geändert

      // CRITICAL FIX: Update formData.image with the preview URL
      // This ensures updateRecipe has a valid image URL
      setFormData(prev => ({
        ...prev,
        image: preview,
        imageAlt: prev.imageAlt || prev.title || 'Rezeptbild'
      }));

      // Generate Blurhash
      try {
        const hash = await encodeImageToBlurhash(preview);
        setRecipeImageBlurhash(hash);
      } catch (hashErr) {
        logger.warn('AddRecipe', 'Failed to generate blurhash', hashErr);
      }
    } catch (err: unknown) {
      logger.error('AddRecipe', 'Image processing failed', err);
      setRecipeImageMeta(null);
      setError(getUserErrorMessage(err, 'image'));
    } finally {
      setIsUploadingRecipeImage(false);
    }
  };

  const handleImageEditorApply = async (editedBlob: Blob) => {
    setIsUploadingRecipeImage(true);
    setError(null);

    try {
      // Bild komprimieren
      const compressed = await compressImage(editedBlob, 1200, 0.75, 'image/jpeg');
      const dimensions = await getImageDimensionsFromBlob(compressed);
      setPendingImageBlob(compressed);
      setRecipeImageStorageId(null);
      setRecipeImageMeta(dimensions);

      // Alte Preview URL aufräumen
      if (recipeImagePreviewUrl) URL.revokeObjectURL(recipeImagePreviewUrl);

      // Neue Preview URL erstellen
      const preview = URL.createObjectURL(compressed);
      setRecipeImagePreviewUrl(preview);

      setImageChanged(true); // MARKIERUNG: Bild hat geändert

      // CRITICAL FIX: Update formData.image with the new preview URL
      setFormData(prev => ({
        ...prev,
        image: preview,
        imageAlt: prev.imageAlt || prev.title || 'Rezeptbild'
      }));

      // Blurhash generieren
      try {
        const hash = await encodeImageToBlurhash(preview);
        setRecipeImageBlurhash(hash);
      } catch (hashErr) {
        logger.warn('AddRecipe', 'Failed to generate blurhash', hashErr);
      }

      // ImageEditor schließen
      setIsImageEditorOpen(false);
      setError(null);
    } catch (err: unknown) {
      logger.error('AddRecipe', 'Image editor apply failed', err);
      setRecipeImageMeta(null);
      setError(getUserErrorMessage(err, 'image'));
    } finally {
      setIsUploadingRecipeImage(false);
    }
  };

  const handleImageEditorCancel = () => {
    setIsImageEditorOpen(false);
  };

  const sanitizeSourceImageUrlForSave = (value: string) => {
    const trimmed = value.trim();
    // Convex documents are limited to 1 MiB. Never persist base64 data URLs.
    if (!trimmed) return undefined;
    if (trimmed.startsWith('data:')) return undefined;
    return trimmed;
  };

  const sanitizeImageUrl = (value: string | undefined) => {
    if (!value) return '';
    const trimmed = value.trim();
    // Filter out blob: URLs and data: URLs - they can't be stored in Convex
    if (trimmed.startsWith('blob:')) return '';
    if (trimmed.startsWith('data:')) return '';
    return trimmed;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    const correlationId = withCorrelation(createUuid());
    capture(initialData ? 'recipe_edited' : 'recipe_create_started', {
      correlationId,
      source: addModalImportUrl ? 'link' : 'manual',
    });

    try {
      // ============================================================
      // PROAKTIVE LIMIT PRÜFUNG (Vor dem Speichern!)
      // ============================================================
      if (!initialData) { // Nur bei neuem Rezept prüfen
        let limitCheck;

        // Feature-Typ bestimmen
        if (addModalImportUrl) {
          // URL Import (z.B. Share Target, Instagram, Website)
          limitCheck = canImportLink;
        } else {
          // Manuelles Rezept (keine URL, kein Foto-Scan)
          limitCheck = canCreateManual;
        }

        // Prüfen ob Limit erreicht
        if (
          limitCheck &&
          !limitCheck.canProceed &&
          limitCheck.feature &&
          typeof limitCheck.current === "number" &&
          typeof limitCheck.limit === "number"
        ) {
          setShowUpgradeModal({
            isOpen: true,
            feature: limitCheck.feature,
            current: limitCheck.current,
            limit: limitCheck.limit,
          });
          setIsSaving(false);
          return;
        }
      }

      const sourceImageUrl = sanitizeSourceImageUrlForSave(formData.sourceImageUrl);
      const instructions = sanitizeInstructionsIcons(formData.instructions);
      let nextImageStorageId = recipeImageStorageId;
      let imageMetaToSave: ImageDimensions | null = recipeImageMeta;

      // Upload lokale Änderungen erst beim Save, um verwaiste Files zu minimieren.
      if (imageChanged && pendingImageBlob) {
        if (!imageMetaToSave) {
          try {
            imageMetaToSave = await getImageDimensionsFromBlob(pendingImageBlob);
          } catch (e) {
            logger.warn('AddRecipe', 'Could not read pending image dimensions', e);
          }
        }

        const uploadUrl = await generateImageUploadUrl({ purpose: 'recipe_image' });
        const json = await uploadJpegToConvexStorage(uploadUrl, pendingImageBlob);
        nextImageStorageId = json.storageId as Id<'_storage'>;
        await registerUploadedAsset({ storageId: nextImageStorageId, purpose: 'recipe_image' });
        setRecipeImageStorageId(nextImageStorageId);
        setPendingImageBlob(null);
      }

      // URL für Bild ermitteln
      let imageUrl: string | undefined = sanitizeImageUrl(formData.image) || undefined;
      if (nextImageStorageId && recipeImagePreviewUrl) {
        // Bei Storage-Bild: Original-URL aus initialData verwenden wenn keine Änderung
        if (initialData && originalImageData?.url && !imageChanged) {
          imageUrl = originalImageData.url; // Behalte Original-URL
        } else if (!recipeImagePreviewUrl.startsWith('blob:')) {
          imageUrl = recipeImagePreviewUrl;
        }
      }

      if (imageChanged && !imageMetaToSave && imageUrl) {
        try {
          imageMetaToSave = await getImageDimensionsFromUrl(imageUrl);
        } catch (e) {
          logger.warn('AddRecipe', 'Could not read final image dimensions from URL', e);
        }
      }

      if (initialData) {
        // UPDATE - Bilddaten nur senden wenn sich geändert
        const updateData: Parameters<typeof updateRecipe>[0] = {
          id: initialData._id,
          title: formData.title,
          category: formData.category,
          prepTimeMinutes: formData.prepTimeMinutes,
          difficulty: formData.difficulty,
          portions: formData.portions,
          ingredients: formData.ingredients,
          instructions,
          imageAlt: formData.imageAlt || initialData.imageAlt,
          sourceImageUrl,
          isFavorite: initialData.isFavorite,
        };

        // Bild-Felder nur senden wenn sich das Bild geändert hat
        if (imageChanged) {
          updateData.image = imageUrl;
          updateData.imageBlurhash = recipeImageBlurhash ?? undefined;
          if (nextImageStorageId) {
            updateData.imageStorageId = nextImageStorageId;
          } else if (originalImageData?.storageId) {
            updateData.clearImageStorageId = true;
          }

          if (imageMetaToSave) {
            updateData.imageWidth = imageMetaToSave.width;
            updateData.imageHeight = imageMetaToSave.height;
            updateData.imageAspectRatio = imageMetaToSave.aspectRatio;
          } else {
            updateData.clearImageMetadata = true;
          }
        }

        await updateRecipe(updateData);
        capture('recipe_edited', { recipeId: initialData._id, correlationId });
      } else {
        // CREATE - Immer alle Daten senden
        await createRecipe({
          ...formData,
          image: imageUrl || (nextImageStorageId ? undefined : PLACEHOLDER_RECIPE_IMAGE),
          instructions,
          imageStorageId: nextImageStorageId ?? undefined,
          imageBlurhash: recipeImageBlurhash ?? undefined,
          imageWidth: imageMetaToSave?.width,
          imageHeight: imageMetaToSave?.height,
          imageAspectRatio: imageMetaToSave?.aspectRatio,
          sourceImageUrl,
          isFavorite: false,
        });
        capture('recipe_saved', {
          correlationId,
          source: addModalImportUrl ? 'link' : 'manual',
          category: formData.category,
        });
      }
      // ObjectURL aufräumen, falls vorhanden
      if (recipeImagePreviewUrl && recipeImagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(recipeImagePreviewUrl);
      }
      exitWith(onClose);
    } catch (err: unknown) {
      capture('recipe_create_failed', { correlationId, errorCode: 'SAVE_FAILED' });
      // ============================================================
      // STRUKTURIERTES ERROR HANDLING
      // ============================================================
      const errorMessage = getErrorMessage(err);
      try {
        const errorData = JSON.parse(errorMessage) as {
          type?: string;
          feature?: UpgradeFeature;
          current?: number;
          limit?: number;
          message?: string;
        };

        if (
          errorData.type === "LIMIT_REACHED" &&
          errorData.feature &&
          typeof errorData.current === "number" &&
          typeof errorData.limit === "number"
        ) {
          setShowUpgradeModal({
            isOpen: true,
            feature: errorData.feature,
            current: errorData.current,
            limit: errorData.limit,
          });
          return;
        }

        if (errorData.type === "RATE_LIMIT_EXCEEDED") {
          setError(`Zu viele Anfragen. Bitte warte einen Moment.`);
          return;
        }

        if (errorData.type === "API_UNAVAILABLE") {
          setError(errorData.message ?? "Der Import-Service ist gerade nicht verfügbar.");
          return;
        }

        // Fallback: Normale Nachricht anzeigen
        setError(getUserErrorMessage(err, 'save'));

      } catch {
        // Kein JSON-Error, normale Nachricht anzeigen
        setError(getUserErrorMessage(err, 'save'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  // An body gehängt: In der Rezeptseite läge das Formular sonst in einem Container, der selbst schon mit der
  // Tastatur schrumpft. Nur der Inhalt rückt per .kb-pad über die Tastatur; die Fußleiste blendet .kb-hide dann aus.
  return createPortal(
    <>
    <div
      className={`kb-pad fixed inset-0 z-[60] flex flex-col bg-background-light font-display text-[#15241b] will-change-transform ${closing ? 'sheet-out' : 'sheet-in'}`}
      role="dialog"
      aria-modal="true"
      aria-label={initialData ? 'Rezept bearbeiten' : 'Rezept schreiben'}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <header className="flex flex-none items-center gap-3 px-4 pb-3" style={{ paddingTop: 'calc(var(--safe-area-inset-top, 0px) + 0.75rem)' }}>
          <h2 className="flex-1 text-[22px] font-extrabold tracking-[-0.015em]">
            {initialData ? 'Rezept bearbeiten' : 'Rezept schreiben'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Schließen"
            className="flex size-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-95"
          >
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          {error && (
            <div className="mb-3 rounded-2xl bg-[#fdecea] px-4 py-3 text-[14px] font-medium text-[#b4472c]" role="alert">
              {error}
            </div>
          )}

          <ManualRecipeForm
            formData={formData}
            setFormData={setFormData}
            existingCategories={existingCategories}
            isNewCategoryMode={isNewCategoryMode}
            setIsNewCategoryMode={setIsNewCategoryMode}
            recipeImagePreviewUrl={recipeImagePreviewUrl}
            recipeImageStorageId={recipeImageStorageId}
            recipeImageInputRef={recipeImageInputRef}
            isImageActionMenuOpen={isImageActionMenuOpen}
            setIsImageActionMenuOpen={setIsImageActionMenuOpen}
            imageActionMenuRef={imageActionMenuRef}
            openRecipeImagePicker={openRecipeImagePicker}
            handleGenerateAiImage={() => { void handleGenerateAiImage(); }}
            handleRecipeImageSelect={handleRecipeImageSelect}
            isUploadingRecipeImage={isUploadingRecipeImage}
            isGeneratingAiImage={isGeneratingAiImage}
            aiImageGenerationStage={aiImageGenerationStage}
            isSaving={isSaving}
            isImageEditorOpen={isImageEditorOpen}
            setIsImageEditorOpen={setIsImageEditorOpen}
            handleImageEditorApply={handleImageEditorApply}
            handleImageEditorCancel={handleImageEditorCancel}
          />
        </div>

        <footer
          className="kb-hide flex flex-none gap-3 border-t border-black/[0.05] bg-white px-4 pt-3"
          style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom, 0px) + 0.75rem)' }}
        >
          <button
            type="button"
            onClick={handleClose}
            className="h-12 flex-1 rounded-full bg-background-light text-[15px] font-bold active:scale-[0.98]"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isUploadingRecipeImage || isGeneratingAiImage || !formData.title.trim()}
            className="h-12 flex-[1.4] rounded-full bg-[#2f5d46] text-[15px] font-bold text-white transition-colors active:scale-[0.98] disabled:bg-[#a9c2b3]"
          >
            {isSaving ? 'Speichere …' : (initialData ? 'Änderungen speichern' : 'Rezept speichern')}
          </button>
        </footer>
      </div>
    </div>

    {/* ============================================================
        UPGRADE MODAL - Wird angezeigt bei Limit Reached
        ============================================================ */}
    {showUpgradeModal.isOpen && (
      <UpgradeModal
        isOpen={showUpgradeModal.isOpen}
        onClose={() => setShowUpgradeModal({ ...showUpgradeModal, isOpen: false })}
        feature={showUpgradeModal.feature}
        currentCount={showUpgradeModal.current}
        limit={showUpgradeModal.limit}
      />
    )}
  </>,
    document.body,
  );
};

export default AddRecipeModal;
