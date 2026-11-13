import React, { useEffect, useRef } from "react";
import { ChevronDown, ImagePlus, Loader2, Minus, Pencil, Plus, Sparkles, Upload } from "lucide-react";
import { Id } from "../../convex/_generated/dataModel";
import ImageEditor from "./ImageEditor";
import IconDropdown from "./IconDropdown";

type Ingredient = { name: string; amount?: string };

type Instruction = { text: string; icon?: string };

export type ManualFormData = {
  title: string;
  category: string;
  prepTimeMinutes: number;
  difficulty: "Einfach" | "Mittel" | "Schwer";
  portions: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  image: string;
  imageAlt: string;
  imageBlurhash?: string;
  sourceImageUrl: string;
};

type Props = {
  formData: ManualFormData;
  setFormData: React.Dispatch<React.SetStateAction<ManualFormData>>;

  existingCategories: string[];
  isNewCategoryMode: boolean;
  setIsNewCategoryMode: (next: boolean) => void;

  recipeImagePreviewUrl: string | null;
  recipeImageStorageId: Id<"_storage"> | null;
  recipeImageInputRef: React.RefObject<HTMLInputElement | null>;

  isImageActionMenuOpen: boolean;
  setIsImageActionMenuOpen: (next: boolean) => void;
  imageActionMenuRef: React.RefObject<HTMLDivElement | null>;

  openRecipeImagePicker: () => void;
  handleGenerateAiImage: () => void;
  handleRecipeImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;

  isUploadingRecipeImage: boolean;
  isGeneratingAiImage: boolean;
  aiImageGenerationStage: "idle" | "requesting" | "generating" | "loading";
  isSaving: boolean;

  // ImageEditor Props
  isImageEditorOpen: boolean;
  setIsImageEditorOpen: (next: boolean) => void;
  handleImageEditorApply: (editedImage: Blob) => void;
  handleImageEditorCancel: () => void;
};

const NEW_CATEGORY = "___NEW___";
const CUSTOM_CATEGORY = "custom_value";
const CTA = "#2f5d46";
const MUTED = "#6b7a72";
/** Graue Felder in weißen Karten; Fokus im Cookly-Grün. */
const FIELD = "rounded-xl border-0 bg-background-light px-3.5 text-[15px] text-[#15241b] placeholder:text-[#9aa5a0] focus:outline-none focus:ring-2 focus:ring-[#2f5d46]";

/** Mehrere Zeilen in ein Zutatenfeld eingefügt: je Zeile eine Zutat, führende Menge abgetrennt. */
const splitIngredientLines = (text: string): Ingredient[] | null => {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  if (lines.length < 2) return null;
  return lines.map((line) => {
    const match = line.match(/^([\d.,/½¼¾]+\s*(?:g|kg|ml|l|EL|TL|Prise|Prisen|Dose|Dosen|Bund|Stk\.?|Stück|Becher|Pck\.?|Päckchen)?)\s+(.+)$/i);
    return match ? { amount: match[1], name: match[2] } : { amount: "", name: line };
  });
};

/** Mehrere Absätze oder nummerierte Zeilen in einen Schritt eingefügt: je Absatz ein Schritt. */
const splitInstructionText = (text: string): Instruction[] | null => {
  const parts = text.split(/\r?\n\s*\r?\n|\r?\n(?=\d+[.)]\s)/).map((part) => part.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
  return parts.length < 2 ? null : parts.map((part) => ({ text: part }));
};

/**
 * Formular für „Selbst schreiben“ und „Bearbeiten“: Reihenfolge wie bisher (Bild, Titel, Kategorie,
 * Zeit/Portionen/Schwierigkeit, Zutaten, Zubereitung), im Cookly-Stil mit weißen Karten und runden Feldern.
 */
const ManualRecipeForm: React.FC<Props> = ({
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
  aiImageGenerationStage,
  isSaving,
  isImageEditorOpen,
  setIsImageEditorOpen,
  handleImageEditorApply,
  handleImageEditorCancel,
}) => {
  const aiGenerationLabel =
    aiImageGenerationStage === "requesting"
      ? "Anfrage wird gestartet..."
      : aiImageGenerationStage === "generating"
        ? "KI erstellt dein Bild..."
        : aiImageGenerationStage === "loading"
          ? "Bild wird geladen..."
          : null;
  const imageBusy = isUploadingRecipeImage || isSaving || isGeneratingAiImage;

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

  const pasteIngredients = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const parsed = splitIngredientLines(e.clipboardData.getData("text"));
    if (!parsed) return;
    e.preventDefault();
    const list = formData.ingredients;
    // Leere Zeile ersetzen, sonst nach der aktuellen Zutat einfügen.
    const replace = !list[index]?.name.trim() && !list[index]?.amount?.trim();
    setFormData({
      ...formData,
      ingredients: [...list.slice(0, replace ? index : index + 1), ...parsed, ...list.slice(index + 1)],
    });
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

  const pasteInstructions = (index: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const parsed = splitInstructionText(e.clipboardData.getData("text"));
    if (!parsed) return;
    e.preventDefault();
    const list = formData.instructions;
    const replace = !list[index]?.text.trim();
    setFormData({
      ...formData,
      instructions: [...list.slice(0, replace ? index : index + 1), ...parsed, ...list.slice(index + 1)],
    });
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
      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
        {/* Bild */}
        <div className="relative aspect-video w-full rounded-3xl bg-white shadow-sm">
          <img
            src={recipeImagePreviewUrl ?? formData.image}
            alt={formData.imageAlt || formData.title || "Rezeptbild"}
            className="size-full rounded-3xl object-cover"
          />
          {isGeneratingAiImage && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-black/50 text-white backdrop-blur-[2px]">
              <Loader2 size={26} className="animate-spin" />
              <p className="text-xs font-semibold tracking-wide">{aiGenerationLabel ?? "Bild wird erzeugt..."}</p>
            </div>
          )}
          {isUploadingRecipeImage && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-black/35 text-white">
              <Loader2 size={26} className="animate-spin" />
            </div>
          )}
          <div className="absolute inset-x-3 bottom-3 z-20 flex flex-wrap gap-2">
            <div className="relative" ref={imageActionMenuRef}>
              <button
                type="button"
                onClick={() => setIsImageActionMenuOpen(!isImageActionMenuOpen)}
                disabled={imageBusy}
                aria-expanded={isImageActionMenuOpen}
                className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-4 text-[14px] font-bold text-[#15241b] shadow-md active:scale-95 disabled:opacity-60"
              >
                <ImagePlus size={17} /> Ändern
              </button>

              {isImageActionMenuOpen && (
                <div className="pop-in absolute bottom-12 left-0 z-30 w-56 origin-bottom-left overflow-hidden rounded-2xl bg-white p-1.5 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setIsImageActionMenuOpen(false);
                      openRecipeImagePicker();
                    }}
                    disabled={imageBusy}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-[#15241b] active:bg-black/5 disabled:opacity-60"
                  >
                    <Upload size={18} color={MUTED} /> Bild hochladen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsImageActionMenuOpen(false);
                      handleGenerateAiImage();
                    }}
                    disabled={imageBusy}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-[#15241b] active:bg-black/5 disabled:opacity-60"
                  >
                    <Sparkles size={18} color={CTA} /> Bild erzeugen (KI)
                  </button>
                </div>
              )}
            </div>

            {(recipeImagePreviewUrl || formData.image || recipeImageStorageId) && (
              <button
                type="button"
                onClick={() => setIsImageEditorOpen(true)}
                disabled={imageBusy}
                className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-4 text-[14px] font-bold text-[#15241b] shadow-md active:scale-95 disabled:opacity-60"
              >
                <Pencil size={16} /> Bearbeiten
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
        </div>

        {/* Titel & Kategorie */}
        <Card>
          <Label htmlFor="recipe-title">Titel</Label>
          <input
            id="recipe-title"
            name="title"
            className={`${FIELD} h-12 w-full font-semibold`}
            placeholder="z.B. Spaghetti Bolognese"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            autoComplete="on"
            autoCorrect="on"
            autoCapitalize="sentences"
            spellCheck={true}
            inputMode="text"
          />

          <Label htmlFor="recipe-category" className="mt-4">Kategorie</Label>
          {isNewCategoryMode ? (
            <div className="flex gap-2">
              <input
                id="recipe-category"
                name="category"
                autoFocus
                className={`${FIELD} h-12 min-w-0 flex-1 font-semibold`}
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
                  if (!formData.category) setFormData({ ...formData, category: "Sonstiges" });
                }}
                className="h-12 flex-none rounded-xl bg-background-light px-4 text-[14px] font-bold"
                style={{ color: MUTED }}
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <div className="relative">
              <select
                id="recipe-category"
                name="category"
                className={`${FIELD} h-12 w-full appearance-none pr-10 font-semibold`}
                value={
                  existingCategories.includes(formData.category)
                    ? formData.category
                    : formData.category
                      ? CUSTOM_CATEGORY
                      : ""
                }
                onChange={(e) => {
                  if (e.target.value === NEW_CATEGORY) {
                    setIsNewCategoryMode(true);
                    setFormData({ ...formData, category: "" });
                  } else {
                    setFormData({ ...formData, category: e.target.value });
                  }
                }}
              >
                {!existingCategories.includes(formData.category) && formData.category && (
                  <option value={CUSTOM_CATEGORY} disabled>
                    {formData.category}
                  </option>
                )}

                {existingCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option disabled>──────────</option>
                <option value={NEW_CATEGORY}>+ Neue Kategorie erstellen</option>
              </select>
              <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" color={MUTED} />
            </div>
          )}
        </Card>

        {/* Metadaten */}
        <Card className="grid grid-cols-3 gap-2.5">
          <div>
            <Label htmlFor="recipe-time">Zeit (Min)</Label>
            <input
              id="recipe-time"
              name="prepTimeMinutes"
              type="number"
              inputMode="numeric"
              min={0}
              className={`${FIELD} h-12 w-full text-center font-bold`}
              value={formData.prepTimeMinutes}
              onChange={(e) =>
                setFormData({ ...formData, prepTimeMinutes: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <Label htmlFor="recipe-portions">Portionen</Label>
            <input
              id="recipe-portions"
              name="portions"
              type="number"
              inputMode="numeric"
              min={0}
              className={`${FIELD} h-12 w-full text-center font-bold`}
              value={formData.portions}
              onChange={(e) => setFormData({ ...formData, portions: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label htmlFor="recipe-difficulty">Schwierigkeit</Label>
            <div className="relative">
              <select
                id="recipe-difficulty"
                name="difficulty"
                className={`${FIELD} h-12 w-full appearance-none pl-3 pr-7 font-bold`}
                value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as ManualFormData["difficulty"] })}
              >
                <option>Einfach</option>
                <option>Mittel</option>
                <option>Schwer</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" color={MUTED} />
            </div>
          </div>
        </Card>

        {/* Zutaten */}
        <Card>
          <Label>Zutaten</Label>
          <div className="space-y-2">
            {formData.ingredients.map((ing, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  id={`ing-amount-${idx}`}
                  name={`ing-amount-${idx}`}
                  placeholder="Menge"
                  aria-label={`Menge ${idx + 1}`}
                  className={`${FIELD} h-11 w-[84px] flex-none font-semibold text-[#2f5d46]`}
                  value={ing.amount ?? ""}
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
                  aria-label={`Zutat ${idx + 1}`}
                  className={`${FIELD} h-11 min-w-0 flex-1`}
                  value={ing.name}
                  onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                  onPaste={(e) => pasteIngredients(idx, e)}
                  autoComplete="on"
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  inputMode="text"
                />
                {formData.ingredients.length > 1 && (
                  <RemoveButton label="Zutat entfernen" onClick={() => removeIngredient(idx)} />
                )}
              </div>
            ))}
          </div>
          <AddButton onClick={addIngredient}>Zutat hinzufügen</AddButton>
        </Card>

        {/* Instruktionen */}
        <Card>
          <Label>Zubereitung</Label>
          <div className="space-y-3">
            {formData.instructions.map((inst, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <span className="mt-2.5 flex size-7 flex-none items-center justify-center rounded-full bg-[#2f5d46] text-[13px] font-black text-white">
                  {idx + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <textarea
                    id={`instruction-${idx}`}
                    name={`instruction-${idx}`}
                    ref={(el) => { textareaRefs.current[idx] = el; }}
                    aria-label={`Schritt ${idx + 1}`}
                    className={`${FIELD} w-full resize-none overflow-hidden py-3 leading-snug`}
                    style={{ minHeight: '52px' }}
                    value={inst.text}
                    onChange={(e) => updateInstruction(idx, "text", e.target.value)}
                    onInput={(e) => adjustTextareaHeight(e.currentTarget)}
                    onPaste={(e) => pasteInstructions(idx, e)}
                    placeholder="Anweisung..."
                    autoComplete="on"
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    spellCheck={true}
                    inputMode="text"
                  />
                  <div className="flex items-center">
                    <IconDropdown
                      value={inst.icon || ""}
                      onChange={(newIcon) => updateInstruction(idx, "icon", newIcon)}
                    />
                  </div>
                </div>
                {formData.instructions.length > 1 && (
                  <span className="mt-2">
                    <RemoveButton label="Schritt entfernen" onClick={() => removeInstruction(idx)} />
                  </span>
                )}
              </div>
            ))}
          </div>
          <AddButton onClick={addInstruction}>Schritt hinzufügen</AddButton>
        </Card>
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

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <section className={`rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)] ${className}`}>{children}</section>
);

const Label: React.FC<{ children: React.ReactNode; htmlFor?: string; className?: string }> = ({ children, htmlFor, className = "" }) => (
  <label htmlFor={htmlFor} className={`mb-1.5 block text-[12px] font-bold uppercase tracking-[0.04em] ${className}`} style={{ color: MUTED }}>
    {children}
  </label>
);

const RemoveButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="flex size-8 flex-none items-center justify-center rounded-full bg-[#fdecea] text-[#c2412d] active:scale-95"
  >
    <Minus size={16} strokeWidth={2.6} />
  </button>
);

const AddButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-3 flex h-10 items-center gap-2 rounded-full bg-[#dcebe1] pl-1.5 pr-4 text-[14px] font-bold text-[#2f5d46] active:scale-[0.98]"
  >
    <span className="flex size-7 items-center justify-center rounded-full bg-[#2f5d46] text-white">
      <Plus size={16} strokeWidth={2.6} />
    </span>
    {children}
  </button>
);

export default ManualRecipeForm;
