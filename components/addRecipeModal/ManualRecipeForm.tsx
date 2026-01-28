import React, { useEffect, useRef } from "react";
import { Id } from "../../convex/_generated/dataModel";
import ImageEditor from "./ImageEditor";
import IconDropdown from "./IconDropdown";

type Ingredient = { name: string; amount?: string };

type Instruction = { text: string; icon?: string };

export type ManualFormData = {
  title: string;
  category: string;
  prepTimeMinutes: number;
  difficulty: string;
  portions: number;
  ingredients: Array<{ name: string; amount: string }>;
  instructions: Array<{ text: string; icon?: string }>;
  image: string;
  imageAlt: string;
  imageBlurhash?: string;
  sourceImageUrl: string;
};

type Props = {
  initialData?: boolean;

  formData: ManualFormData;
  setFormData: (next: ManualFormData) => void;

  existingCategories: string[];
  isNewCategoryMode: boolean;
  setIsNewCategoryMode: (next: boolean) => void;

  recipeImagePreviewUrl: string | null;
  recipeImageStorageId: Id<"_storage"> | null;
  recipeImageInputRef: React.RefObject<HTMLInputElement>;

  isImageActionMenuOpen: boolean;
  setIsImageActionMenuOpen: (next: boolean) => void;
  imageActionMenuRef: React.RefObject<HTMLDivElement>;

  openRecipeImagePicker: () => void;
  handleGenerateAiImage: () => void;
  handleRecipeImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;

  isUploadingRecipeImage: boolean;
  isGeneratingAiImage: boolean;
  isSaving: boolean;
  isAnalyzing: boolean;

  // ImageEditor Props
  isImageEditorOpen: boolean;
  setIsImageEditorOpen: (next: boolean) => void;
  handleImageEditorApply: (editedImage: Blob) => void;
  handleImageEditorCancel: () => void;
};

const ManualRecipeForm: React.FC<Props> = ({
  initialData,
  formData,
  setFormData,
  existingCategories,
  isNewCategoryMode,
  setIsNewCategoryMode,
  recipeImagePreviewUrl,
  recipeImageStorageId,
  recipeImageInputRef,
  isImageActionMenuOpen,
  setIsImageActionMenuOpen,
  imageActionMenuRef,
  openRecipeImagePicker,
  handleGenerateAiImage,
  handleRecipeImageSelect,
  isUploadingRecipeImage,
  isGeneratingAiImage,
  isSaving,
  isAnalyzing,
  isImageEditorOpen,
  setIsImageEditorOpen,
  handleImageEditorApply,
  handleImageEditorCancel,
}) => {
  const updateIngredient = (index: number, field: "name" | "amount", value: string) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[index] = { ...newIngredients[index], [field]: value };
    setFormData({ ...formData, ingredients: newIngredients });
  };

  const addIngredient = () => {
    setFormData({
      ...formData,
      ingredients: [...formData.ingredients, { name: "", amount: "" }],
    });
  };

  const removeIngredient = (index: number) => {
    const newIngredients = formData.ingredients.filter((_, i) => i !== index);
    setFormData({ ...formData, ingredients: newIngredients });
  };

  const updateInstruction = (index: number, field: "text" | "icon", value: string) => {
    const newInstructions = [...formData.instructions];
    newInstructions[index] = { ...newInstructions[index], [field]: value };
    setFormData({ ...formData, instructions: newInstructions });
  };

  const addInstruction = () => {
    setFormData({
      ...formData,
      instructions: [...formData.instructions, { text: "" }],
    });
  };

  const removeInstruction = (index: number) => {
    const newInstructions = formData.instructions.filter((_, i) => i !== index);
    setFormData({ ...formData, instructions: newInstructions });
  };

  // Auto-resize textareas
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const adjustTextareaHeight = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  useEffect(() => {
    textareaRefs.current.forEach(adjustTextareaHeight);
  }, [formData.instructions]);

  return (
    <>
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        <div className="pt-2">

          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="w-full md:w-56 aspect-video rounded-xl overflow-hidden bg-gray-100 dark:bg-white/5">
              <img
                src={recipeImagePreviewUrl ?? formData.image}
                alt={formData.imageAlt || formData.title || "Rezeptbild"}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 w-full">
              <div className="flex flex-nowrap items-center gap-2">
                <div className="relative" ref={imageActionMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsImageActionMenuOpen(!isImageActionMenuOpen)}
                    disabled={isUploadingRecipeImage || isSaving || isAnalyzing || isGeneratingAiImage}
                    className="px-3 sm:px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-base sm:text-lg">image</span>
                    Ändern
                  </button>

                  {isImageActionMenuOpen && (
                    <div className="absolute left-0 mt-2 w-56 overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#1e3031] shadow-2xl z-20 animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsImageActionMenuOpen(false);
                            openRecipeImagePicker();
                          }}
                          disabled={isUploadingRecipeImage || isSaving || isAnalyzing || isGeneratingAiImage}
                          className="w-full px-3 py-2.5 text-left text-sm text-gray-800 dark:text-white hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg flex items-center gap-3 transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg text-gray-500">upload</span>
                          Bild hochladen
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsImageActionMenuOpen(false);
                            handleGenerateAiImage();
                          }}
                          disabled={isUploadingRecipeImage || isSaving || isAnalyzing || isGeneratingAiImage}
                          className="w-full px-3 py-2.5 text-left text-sm text-gray-800 dark:text-white hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg flex items-center gap-3 transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg text-primary">auto_fix_high</span>
                          Bild erzeugen (KI)
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {(recipeImagePreviewUrl || formData.image || recipeImageStorageId) && (
                  <button
                    type="button"
                    onClick={() => setIsImageEditorOpen(true)}
                    disabled={isUploadingRecipeImage || isSaving || isAnalyzing || isGeneratingAiImage}
                    className="px-3 sm:px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-base sm:text-lg">edit</span>
                    Bearbeiten
                  </button>
                )}
              </div>

              <input
                type="file"
                ref={recipeImageInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleRecipeImageSelect}
              />

              {isUploadingRecipeImage && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Bild wird hochgeladen...</p>
              )}

              {isGeneratingAiImage && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Bild wird erzeugt...</p>
              )}

            </div>
          </div>
        </div>

        {/* Titel & Kategorie */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="recipe-title" className="block text-xs font-bold text-gray-500 uppercase mb-1">Titel</label>
            <input
              id="recipe-title"
              name="title"
              className="w-full bg-gray-50 dark:bg-black/20 border-0 rounded-lg p-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary"
              placeholder="z.B. Spaghetti Bolognese"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              autoComplete="on"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
              inputMode="text"
            />
          </div>
          <div>
            <label htmlFor="recipe-category" className="block text-xs font-bold text-gray-500 uppercase mb-1">Kategorie</label>
            {isNewCategoryMode ? (
              <div className="flex gap-2">
                <input
                  id="recipe-category"
                  name="category"
                  autoFocus
                  className="w-full bg-gray-50 dark:bg-black/20 border-0 rounded-lg p-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary"
                  placeholder="Neue Kategorie..."
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  autoComplete="on"
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  inputMode="text"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsNewCategoryMode(false);
                    if (!formData.category) setFormData({ ...formData, category: "Hauptgericht" });
                  }}
                  className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium"
                >
                  Abbrechen
                </button>
              </div>
            ) : (
              <select
                id="recipe-category"
                name="category"
                className="w-full bg-gray-50 dark:bg-black/20 border-0 rounded-lg p-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary appearance-none"
                value={
                  existingCategories.includes(formData.category)
                    ? formData.category
                    : formData.category
                      ? "custom_value"
                      : ""
                }
                onChange={(e) => {
                  if (e.target.value === "___NEW___") {
                    setIsNewCategoryMode(true);
                    setFormData({ ...formData, category: "" });
                  } else {
                    setFormData({ ...formData, category: e.target.value });
                  }
                }}
              >
                {!existingCategories.includes(formData.category) && formData.category && (
                  <option value="custom_value" disabled>
                    {formData.category}
                  </option>
                )}

                {existingCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option disabled>──────────</option>
                <option value="___NEW___">+ Neue Kategorie erstellen</option>
              </select>
            )}
          </div>
        </div>

        {/* Metadaten */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="recipe-time" className="block text-xs font-bold text-gray-500 uppercase mb-1">Zeit (Min)</label>
            <input
              id="recipe-time"
              name="prepTimeMinutes"
              type="number"
              className="w-full bg-gray-50 dark:bg-black/20 border-0 rounded-lg p-3 text-gray-900 dark:text-white"
              value={formData.prepTimeMinutes}
              onChange={(e) =>
                setFormData({ ...formData, prepTimeMinutes: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label htmlFor="recipe-portions" className="block text-xs font-bold text-gray-500 uppercase mb-1">Portionen</label>
            <input
              id="recipe-portions"
              name="portions"
              type="number"
              className="w-full bg-gray-50 dark:bg-black/20 border-0 rounded-lg p-3 text-gray-900 dark:text-white"
              value={formData.portions}
              onChange={(e) => setFormData({ ...formData, portions: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label htmlFor="recipe-difficulty" className="block text-xs font-bold text-gray-500 uppercase mb-1">Schwierigkeit</label>
            <select
              id="recipe-difficulty"
              name="difficulty"
              className="w-full bg-gray-50 dark:bg-black/20 border-0 rounded-lg p-3 text-gray-900 dark:text-white"
              value={formData.difficulty}
              onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
            >
              <option>Einfach</option>
              <option>Mittel</option>
              <option>Schwer</option>
            </select>
          </div>
        </div>

        {/* Zutaten */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Zutaten</label>
          <div className="space-y-2">
            {formData.ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  id={`ing-amount-${idx}`}
                  name={`ing-amount-${idx}`}
                  placeholder="Menge"
                  className="w-20 sm:w-24 flex-shrink-0 bg-gray-50 dark:bg-black/20 border-0 rounded-lg p-2 text-sm dark:text-white"
                  value={ing.amount}
                  onChange={(e) => updateIngredient(idx, "amount", e.target.value)}
                  autoComplete="on"
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  inputMode="text"
                />
                <input
                  id={`ing-name-${idx}`}
                  name={`ing-name-${idx}`}
                  placeholder="Zutat"
                  className="flex-1 min-w-0 bg-gray-50 dark:bg-black/20 border-0 rounded-lg p-2 text-sm dark:text-white"
                  value={ing.name}
                  onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                  autoComplete="on"
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  inputMode="text"
                />
                {formData.ingredients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeIngredient(idx)}
                    className="flex-shrink-0 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1"
                    title="Zutat entfernen"
                  >
                    <span className="material-symbols-outlined text-lg">remove_circle</span>
                  </button>
                )}
              </div>
            ))}
            <button onClick={addIngredient} className="text-primary text-sm font-medium hover:underline">
              + Zutat hinzufügen
            </button>
          </div>
        </div>

        {/* Instruktionen */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Zubereitung</label>
          <div className="space-y-2">
            {formData.instructions.map((inst, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <span className="mt-2 text-xs font-bold text-gray-400">{idx + 1}.</span>
                <div className="flex-1 flex flex-col gap-2">
                  <textarea
                    id={`instruction-${idx}`}
                    name={`instruction-${idx}`}
                    ref={(el) => { textareaRefs.current[idx] = el; }}
                    className="w-full bg-gray-50 dark:bg-black/20 border-0 rounded-lg p-2 text-sm dark:text-white resize-none overflow-hidden"
                    style={{ minHeight: '40px' }}
                    value={inst.text}
                    onChange={(e) => updateInstruction(idx, "text", e.target.value)}
                    onInput={(e) => adjustTextareaHeight(e.currentTarget)}
                    placeholder="Anweisung..."
                    autoComplete="on"
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    spellCheck={true}
                    inputMode="text"
                  />
                  <div className="flex items-center gap-2">
                    <IconDropdown
                      value={inst.icon || ""}
                      onChange={(newIcon) => updateInstruction(idx, "icon", newIcon)}
                    />
                  </div>
                </div>
                {formData.instructions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeInstruction(idx)}
                    className="flex-shrink-0 mt-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1"
                    title="Schritt entfernen"
                  >
                    <span className="material-symbols-outlined text-lg">remove_circle</span>
                  </button>
                )}
              </div>
            ))}
            <button onClick={addInstruction} className="text-primary text-sm font-medium hover:underline">
              + Schritt hinzufügen
            </button>
          </div>
        </div>
      </form>

      {/* ImageEditor Modal */}
      {isImageEditorOpen && (
        <ImageEditor
          imageUrl={recipeImagePreviewUrl ?? formData.image}
          onApply={handleImageEditorApply}
          onCancel={handleImageEditorCancel}
        />
      )}
    </>
  );
};

export default ManualRecipeForm;
