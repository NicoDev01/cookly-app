import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Recipe } from '../types';
import { Id } from "../convex/_generated/dataModel";
import { useNavigate } from 'react-router-dom';
import { sanitizeInstructionsIcons } from '../utils/iconUtils';
import { AI_SCAN_PROMPT_FIXED, analyzeRecipePhoto, createGeminiClient, AiScanPanel } from './addRecipeModal/AiScan.tsx';
import {
  compressImage,
  uploadJpegToConvexStorage,
  getImageDimensionsFromBlob,
  getImageDimensionsFromUrl,
  type ImageDimensions,
} from './addRecipeModal/recipeImage';
import { encodeImageToBlurhash } from '../utils/blurhash';
import ManualRecipeForm from './addRecipeModal/ManualRecipeForm';
import UpgradeModal from './UpgradeModal';
import { useModal } from '../contexts/ModalContext';

interface AddRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Recipe | null; // Optional: Wenn gesetzt, sind wir im Edit-Mode
}

const PLACEHOLDER_RECIPE_IMAGE = 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=2626&auto=format&fit=crop';

const AddRecipeModal: React.FC<AddRecipeModalProps> = ({ isOpen, onClose, initialData }) => {
  const { addModalImportUrl, addModalInitialTab } = useModal();
  const navigate = useNavigate();
  const createRecipe = useMutation(api.recipes.create);
  const updateRecipe = useMutation(api.recipes.updateRecipe);
  const generateImageUploadUrl = useMutation(api.recipes.generateImageUploadUrl);
  const generateAndStoreAiImage = useAction(api.recipes.generateAndStoreAiImage);
  const categoryStats = useQuery(api.recipes.getCategories);
  const existingCategories = categoryStats?.categories?.map(c => c.name) || [];

  // ============================================================
  // NEU: Proaktive Limit Checks
  // ============================================================
  const canCreateManual = useQuery(api.users.canCreateManualRecipe);
  const canImportLink = useQuery(api.users.canImportFromLink);
  const canScanPhoto = useQuery(api.users.canScanPhoto);

  const [showUpgradeModal, setShowUpgradeModal] = useState<{
    isOpen: boolean;
    feature: 'manual_recipes' | 'link_imports' | 'photo_scans';
    current: number;
    limit: number;
  }>({
    isOpen: false,
    feature: 'manual_recipes',
    current: 0,
    limit: 100,
  });

  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // AI Analysis Progress States
  const [analysisStage, setAnalysisStage] = useState<'idle' | 'uploading' | 'analyzing' | 'processing' | 'complete'>('idle');
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const [isUploadingRecipeImage, setIsUploadingRecipeImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNewCategoryMode, setIsNewCategoryMode] = useState(false);
  const [editAfterScan, setEditAfterScan] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recipeImageInputRef = useRef<HTMLInputElement>(null);

  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkProcessed, setBulkProcessed] = useState(0);
  const [bulkCreatedIds, setBulkCreatedIds] = useState<Id<"recipes">[]>([]);
  const [bulkErrors, setBulkErrors] = useState(0);
  const cancelBulkRef = useRef(false);

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
    if (isUploadingRecipeImage || isSaving || isAnalyzing) return;

    setIsGeneratingAiImage(true);
    setAiImageGenerationStage('requesting');
    setError(null);
    if (navigator.vibrate) {
      navigator.vibrate(25);
    }

    try {
      const base = (formData.title || initialData?.title || formData.category || 'recipe').trim();

      // Generate Pollinations URL (no download, URL works directly)
      setAiImageGenerationStage('generating');
      const result = await generateAndStoreAiImage({ recipeTitle: base });
      setAiImageGenerationStage('loading');

      let nextMeta: ImageDimensions | null = null;
      try {
        // Wait for image decoding once so the UI update appears instant/stable.
        nextMeta = await getImageDimensionsFromUrl(result.url);
      } catch (e) {
        console.warn('Could not read AI image dimensions:', e);
      }

      // Clean up old preview URL
      if (recipeImagePreviewUrl) {
        URL.revokeObjectURL(recipeImagePreviewUrl);
      }

      // Pollinations URL: No storage needed, URL works directly
      setRecipeImageStorageId(null);
      setPendingImageBlob(null);
      setRecipeImagePreviewUrl(result.url);
      setRecipeImageMeta(nextMeta);
      setImageChanged(true); // MARKIERUNG: Bild hat geändert

      setFormData(prev => ({
        ...prev,
        image: result.url, // Use Pollinations URL directly
        imageAlt: prev.imageAlt || prev.title || base,
      }));

      // Generate blurhash in background
      encodeImageToBlurhash(result.url)
        .then(hash => setRecipeImageBlurhash(hash))
        .catch(e => console.warn('Could not generate blurhash:', e));
      if (navigator.vibrate) {
        navigator.vibrate([20, 30, 20]);
      }

    } catch (err: any) {
      console.error('AI image generation error:', err);
      setError('Fehler beim Bild erzeugen: ' + (err?.message ?? String(err)));
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
  const [formData, setFormData] = useState(() => {
    if (initialData) {
      return {
        title: initialData.title,
        category: initialData.category,
        prepTimeMinutes: initialData.prepTimeMinutes,
        difficulty: initialData.difficulty,
        portions: initialData.portions,
        ingredients: initialData.ingredients.length > 0 ? initialData.ingredients : [{ name: '', amount: '' }],
        instructions: initialData.instructions.length > 0 ? sanitizeInstructionsIcons(initialData.instructions) : [{ text: '' }],
        image: initialData.image || PLACEHOLDER_RECIPE_IMAGE,
        imageAlt: initialData.imageAlt || '',
        sourceImageUrl: initialData.sourceImageUrl || ''
      };
    }

    return {
      title: '',
      category: 'Hauptgericht',
      prepTimeMinutes: 30,
      difficulty: 'Mittel' as 'Einfach' | 'Mittel' | 'Schwer',
      portions: 4,
      ingredients: [{ name: '', amount: '' }],
      instructions: [{ text: '' }],
      image: PLACEHOLDER_RECIPE_IMAGE,
      imageAlt: 'Leckeres Gericht',
      sourceImageUrl: addModalImportUrl || ''
    };
  });

  // Effect: Wenn initialData sich ändert (oder Modal öffnet), Formular befüllen
  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title,
        category: initialData.category,
        prepTimeMinutes: initialData.prepTimeMinutes,
        difficulty: initialData.difficulty,
        portions: initialData.portions,
        ingredients: initialData.ingredients.length > 0 ? initialData.ingredients : [{ name: '', amount: '' }],
        instructions: initialData.instructions.length > 0 ? sanitizeInstructionsIcons(initialData.instructions) : [{ text: '' }],
        image: initialData.image || PLACEHOLDER_RECIPE_IMAGE,
        imageAlt: initialData.imageAlt || '',
        sourceImageUrl: initialData.sourceImageUrl || ''
      });
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
      setActiveTab('manual');
    } else {
      // Reset für "Neues Rezept"
      setFormData({
        title: '',
        category: 'Hauptgericht',
        prepTimeMinutes: 30,
        difficulty: 'Mittel',
        portions: 4,
        ingredients: [{ name: '', amount: '' }],
        instructions: [{ text: '' }],
        image: PLACEHOLDER_RECIPE_IMAGE,
        imageAlt: 'Leckeres Gericht',
        sourceImageUrl: addModalImportUrl || ''
      });
      setRecipeImageStorageId(null);
      setRecipeImagePreviewUrl(null);
      setRecipeImageBlurhash(null);
      setAiImageGenerationStage('idle');
      setRecipeImageMeta(null);
      setPendingImageBlob(null);
      // If we have an import URL, switch to manual tab where the URL input is visible
      // Otherwise use initialTab if provided, default to 'ai'
      if (addModalImportUrl) {
        setActiveTab('manual');
      } else if (addModalInitialTab) {
        setActiveTab(addModalInitialTab);
      } else {
        setActiveTab('ai');
      }
      setEditAfterScan(true);

      setImageChanged(false);
      setOriginalImageData(null);

      setIsBulkAnalyzing(false);
      setBulkTotal(0);
      setBulkProcessed(0);
      setBulkCreatedIds([]);
      setBulkErrors(0);
      cancelBulkRef.current = false;
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  // --- KI LOGIK ---

  const handleSingleImageUpload = async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisStage('uploading');
    setAnalysisProgress(10);
    setError(null);

    try {
      // Phase 1: Upload preparation
      await new Promise(resolve => setTimeout(resolve, 300));
      setAnalysisProgress(20);

      // Phase 2: Prepare AI analysis
      setAnalysisStage('analyzing');
      setAnalysisProgress(30);
      await new Promise(resolve => setTimeout(resolve, 200));

      const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
      const { ai, model } = createGeminiClient(apiKey);

      // Phase 3: Analyze with progress simulation
      setAnalysisProgress(50);

      const progressInterval = setInterval(() => {
        setAnalysisProgress(prev => {
          if (prev < 80) return prev + 5;
          return prev;
        });
      }, 500);

      const { base64, doc } = await analyzeRecipePhoto({
        ai,
        model,
        file,
        fallback: {
          title: formData.title,
          category: formData.category,
          prepTimeMinutes: formData.prepTimeMinutes,
          difficulty: formData.difficulty,
          portions: formData.portions,
          image: formData.image,
          imageAlt: formData.imageAlt,
        },
        prompt: AI_SCAN_PROMPT_FIXED,
      });

      clearInterval(progressInterval);
      setAnalysisStage('processing');
      setAnalysisProgress(90);
      await new Promise(resolve => setTimeout(resolve, 200));

      setFormData((prev) => ({
        ...prev,
        // WICHTIG: Marker-Wert statt base64 verwenden
        // base64 würde in sanitizeSourceImageUrlForSave ausgefiltert werden
        // Der Marker signalisiert recipes.ts, dass es ein Foto-Scan ist (photo_scans Counter)
        sourceImageUrl: '__AI_SCAN__',
        ...doc,
      }));
      setImageChanged(!!doc.image);
      if (doc.image) {
        getImageDimensionsFromUrl(doc.image)
          .then((meta) => setRecipeImageMeta(meta))
          .catch((e) => {
            console.warn('Could not read AI-scan preview dimensions:', e);
            setRecipeImageMeta(null);
          });
      } else {
        setRecipeImageMeta(null);
      }

      setAnalysisStage('complete');
      setAnalysisProgress(100);

      if (editAfterScan) {
        setActiveTab('manual');
        setAnalysisStage('idle');
        setAnalysisProgress(0);
        return;
      }

      setIsSaving(true);
      try {
        let aiImageMeta: ImageDimensions | undefined;
        if (doc.image) {
          try {
            aiImageMeta = await getImageDimensionsFromUrl(doc.image);
          } catch (e) {
            console.warn('Could not read AI-scan image dimensions:', e);
          }
        }

        const id = await createRecipe({
          ...formData,
          ...doc,
          imageStorageId: undefined,
          imageWidth: aiImageMeta?.width,
          imageHeight: aiImageMeta?.height,
          imageAspectRatio: aiImageMeta?.aspectRatio,
          // WICHTIG: sourceImageUrl wird gesetzt durch setFormData oben (base64)
          // Das signalisiert recipes.ts, dass es ein Foto-Scan ist (photo_scans Counter)
          isFavorite: false,
          isInWeeklyList: false,
        });
        onClose();
        navigate(`/recipe/${id}`);
      } finally {
        setIsSaving(false);
        setAnalysisStage('idle');
        setAnalysisProgress(0);
      }
    } catch (err: any) {
      console.error("AI Error:", err);
      setError("Fehler bei der KI-Analyse: " + (err?.message ?? String(err)));
      setAnalysisStage('idle');
      setAnalysisProgress(0);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBulkImageUpload = async (files: File[]) => {
    setError(null);
    setIsBulkAnalyzing(true);
    setBulkTotal(files.length);
    setBulkProcessed(0);
    setBulkCreatedIds([]);
    setBulkErrors(0);
    cancelBulkRef.current = false;

    try {
      const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
      const { ai, model } = createGeminiClient(apiKey);

      // Shared state for concurrent processing
      const createdIds: Id<"recipes">[] = [];
      let errorCount = 0;

      const processFile = async (file: File) => {
        if (cancelBulkRef.current) return;
        try {
          // 1. Start Gemini Analysis
          const { base64, doc } = await analyzeRecipePhoto({
            ai,
            model,
            file,
            fallback: {
              title: formData.title,
              category: formData.category,
              prepTimeMinutes: formData.prepTimeMinutes,
              difficulty: formData.difficulty,
              portions: formData.portions,
              image: formData.image,
              imageAlt: formData.imageAlt,
            },
            prompt: AI_SCAN_PROMPT_FIXED,
          });

          if (cancelBulkRef.current) return;

          let aiImageMeta: ImageDimensions | undefined;
          if (doc.image) {
            try {
              aiImageMeta = await getImageDimensionsFromUrl(doc.image);
            } catch (e) {
              console.warn('Could not read bulk AI image dimensions:', e);
            }
          }

          // 2. Create Recipe
          const id = await createRecipe({
            title: doc.title,
            category: doc.category,
            image: doc.image,
            imageStorageId: undefined,
            imageBlurhash: undefined,
            imageWidth: aiImageMeta?.width,
            imageHeight: aiImageMeta?.height,
            imageAspectRatio: aiImageMeta?.aspectRatio,
            imageAlt: doc.imageAlt,
            // WICHTIG: Marker-Wert statt base64 verwenden (base64 würde ausgefiltert)
            sourceImageUrl: '__AI_SCAN__',
            prepTimeMinutes: doc.prepTimeMinutes,
            difficulty: doc.difficulty,
            portions: doc.portions,
            isFavorite: false,
            isInWeeklyList: false,
            ingredients: doc.ingredients,
            instructions: doc.instructions,
          });

          createdIds.push(id);
          setBulkCreatedIds([...createdIds]);
        } catch (err) {
          console.error('Bulk AI processing error:', err);
          errorCount++;
          setBulkErrors(errorCount);
        } finally {
          setBulkProcessed((p) => p + 1);
        }
      };

      // Concurrent processing with limit of 3
      const CONCURRENCY_LIMIT = 3;
      const queue = [...files];
      const activePromises = new Set<Promise<void>>();

      while (queue.length > 0 && !cancelBulkRef.current) {
        // If we reached limit, wait for one to finish
        if (activePromises.size >= CONCURRENCY_LIMIT) {
          await Promise.race(activePromises);
        }

        const file = queue.shift();
        if (file) {
          const p = processFile(file).then(() => {
            activePromises.delete(p);
          });
          activePromises.add(p);
        }
      }

      // Wait for remaining
      await Promise.all(activePromises);

      if (cancelBulkRef.current) {
        return;
      }

      if (createdIds.length === 0) {
        setError('Bulk-Upload abgeschlossen, aber es konnte kein Rezept erstellt werden.');
        return;
      }

      const lastId = createdIds[createdIds.length - 1];
      const msg = errorCount > 0
        ? `Fertig! ${createdIds.length} von ${files.length} Rezepten wurden erstellt (${errorCount} Fehler).`
        : `Perfekt! ${createdIds.length} Rezepte wurden erstellt.`;

      onClose();
      navigate(`/recipe/${lastId}`, {
        state: {
          flash: { message: msg, tone: errorCount > 0 ? 'info' : 'success' },
        },
      });
    } finally {
      setIsBulkAnalyzing(false);
    }
  };

  const handleAiFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    if (files.length === 1) {
      await handleSingleImageUpload(files[0]);
      return;
    }
    await handleBulkImageUpload(files);
  };

  const isBusy = isAnalyzing || isSaving || isUploadingRecipeImage || isGeneratingAiImage || isBulkAnalyzing;

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
        console.warn('Failed to generate blurhash:', hashErr);
      }
    } catch (err: any) {
      console.error('Image processing error:', err);
      setRecipeImageMeta(null);
      setError('Fehler bei der Bildverarbeitung: ' + err.message);
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
        console.warn('Failed to generate blurhash:', hashErr);
      }

      // ImageEditor schließen
      setIsImageEditorOpen(false);
      setError(null);
    } catch (err: any) {
      console.error('Image editor apply error:', err);
      setRecipeImageMeta(null);
      setError('Fehler beim Speichern des bearbeiteten Bildes: ' + err.message);
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

    try {
      // ============================================================
      // PROAKTIVE LIMIT PRÜFUNG (Vor dem Speichern!)
      // ============================================================
      if (!initialData) { // Nur bei neuem Rezept prüfen
        let limitCheck;

        // Feature-Typ bestimmen
        if (formData.sourceUrl) {
          // URL Import (z.B. Share Target, Instagram, Website)
          limitCheck = canImportLink;
        } else if (activeTab === 'ai') {
          // KI Foto-Scan (activeTab bestimmt den Typ, nicht sourceImageUrl)
          limitCheck = canScanPhoto;
        } else {
          // Manuelles Rezept (keine URL, kein Foto-Scan)
          limitCheck = canCreateManual;
        }

        // Prüfen ob Limit erreicht
        if (limitCheck && !limitCheck.canProceed) {
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
            console.warn('Could not read pending image dimensions:', e);
          }
        }

        const uploadUrl = await generateImageUploadUrl({});
        const json = await uploadJpegToConvexStorage(uploadUrl, pendingImageBlob);
        nextImageStorageId = json.storageId as Id<'_storage'>;
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
          console.warn('Could not read final image dimensions from URL:', e);
        }
      }

      if (initialData) {
        // UPDATE - Bilddaten nur senden wenn sich geändert
        const updateData: any = {
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
      }
      // ObjectURL aufräumen, falls vorhanden
      if (recipeImagePreviewUrl && recipeImagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(recipeImagePreviewUrl);
      }
      onClose();
    } catch (err: any) {
      // ============================================================
      // STRUKTURIERTES ERROR HANDLING
      // ============================================================
      try {
        const errorData = JSON.parse(err.message);

        if (errorData.type === "LIMIT_REACHED") {
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
          setError(errorData.message);
          return;
        }

        // Fallback: Normale Nachricht anzeigen
        setError("Fehler beim Speichern: " + err.message);

      } catch (parseError) {
        // Kein JSON-Error, normale Nachricht anzeigen
        setError("Fehler beim Speichern: " + err.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e3031] w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-[#1e3031]">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">
            {initialData ? 'Rezept bearbeiten' : 'Neues Rezept'}
          </h2>
          <button
            onClick={() => {
              cancelBulkRef.current = true;
              // ObjectURL aufräumen, falls vorhanden
              if (recipeImagePreviewUrl && recipeImagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(recipeImagePreviewUrl);
              }
              onClose();
            }}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Tabs (nur bei neuem Rezept sinnvoll, aber wir lassen es der Konsistenz halber) */}
        {!initialData && (
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setActiveTab('ai')}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'ai' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}
            >
              ✨ KI-Scan
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'manual' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}
            >
              ✍️ Manuell
            </button>
          </div>
        )}

        {/* Content Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {activeTab === 'ai' && !initialData ? (
            <AiScanPanel
              editAfterScan={editAfterScan}
              setEditAfterScan={setEditAfterScan}
              isBusy={isBusy}
              isBulkAnalyzing={isBulkAnalyzing}
              bulkTotal={bulkTotal}
              bulkProcessed={bulkProcessed}
              bulkErrors={bulkErrors}
              isAnalyzing={isAnalyzing}
              analysisStage={analysisStage}
              analysisProgress={analysisProgress}
              sourceImageUrl={formData.sourceImageUrl}
              fileInputRef={fileInputRef}
              onFileChange={handleAiFileSelection}
            />
          ) : (
            <ManualRecipeForm
              initialData={!!initialData}
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
              isAnalyzing={isAnalyzing}
              isImageEditorOpen={isImageEditorOpen}
              setIsImageEditorOpen={setIsImageEditorOpen}
              handleImageEditorApply={handleImageEditorApply}
              handleImageEditorCancel={handleImageEditorCancel}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
          <button
            onClick={() => {
              // ObjectURL aufräumen, falls vorhanden
              if (recipeImagePreviewUrl && recipeImagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(recipeImagePreviewUrl);
              }
              onClose();
            }}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isAnalyzing || isUploadingRecipeImage || !formData.title}
            className="px-6 py-2 bg-primary text-white font-bold rounded-lg shadow-neomorphism-outset hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Speichere...' : (initialData ? 'Änderungen speichern' : 'Rezept speichern')}
          </button>
        </div>

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
        current={showUpgradeModal.current}
        limit={showUpgradeModal.limit}
      />
    )}
  </>
  );
};

export default AddRecipeModal;
