import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  memo,
  useCallback,
  Suspense,
  lazy,
} from "react";
import { createPortal } from "react-dom";
import { Recipe } from "../types";
import ImageWithBlurhash from "./ImageWithBlurhash";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

// Lazy load modals - they are only needed when user interacts with them
const MealPlanModal = lazy(() => import("./MealPlanModal"));
const ImageZoomModal = lazy(() => import("./ImageZoomModal"));

interface RecipeHeroProps {
  recipe: Recipe;
  onSidebarToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Reusable IconButton component with memo to prevent unnecessary re-renders
interface IconButtonProps {
  icon: string;
  onClick?: (e: React.MouseEvent) => void | Promise<void>;
  className?: string;
  isFilled?: boolean;
  animateBounce?: boolean;
  title?: string;
  ariaLabel?: string;
  ariaPressed?: boolean;
  variant?: "default" | "ghost" | "glass";
}

const IconButton = memo(
  ({
    icon,
    onClick,
    className = "",
    isFilled = false,
    animateBounce = false,
    title,
    ariaLabel,
    ariaPressed,
    variant = "default",
  }: IconButtonProps) => {
    const baseStyles =
      "flex items-center justify-center size-10 rounded-full transition-all duration-200 active:scale-95";

    const variants = {
      default: "bg-white/90 shadow-sm border border-gray-200/50 text-gray-900",
      ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
      glass: "bg-white/85 backdrop-blur-xl border border-white/40 shadow-lg shadow-black/5 text-gray-800 hover:bg-white/95 hover:scale-105",
    };

    return (
      <button
        onClick={onClick}
        className={`${baseStyles} ${variants[variant]} ${className}`}
        title={title}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed === true ? "true" : ariaPressed === false ? "false" : undefined}
      >
        <span
          className={`material-symbols-outlined !text-[28px] ${isFilled ? "filled text-red-500" : ""}`}
          style={
            animateBounce
              ? {
                  animation: "heartBounce 0.4s ease-in-out",
                }
              : undefined
          }
        >
          {icon}
        </span>
        <style>{`
        @keyframes heartBounce {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.3); }
          50% { transform: scale(0.95); }
          75% { transform: scale(1.1); }
        }
      `}</style>
      </button>
    );
  },
);

IconButton.displayName = "IconButton";

// Pre-computed eased mask gradient for smooth image fade-out
// This is computed once at module load time, not on every render
const EASED_MASK_GRADIENT = (() => {
  const start = 90;
  const steps = 100;
  const points = [`rgba(0,0,0,1) 0%`, `rgba(0,0,0,1) ${start}%`];

  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const pos = start + progress * (100 - start);
    const alpha = Math.max(0, 1 - Math.pow(progress, 1)).toFixed(30);
    points.push(`rgba(0,0,0,${alpha}) ${pos.toFixed(2)}%`);
  }
  return `linear-gradient(to bottom, ${points.join(", ")})`;
})();

const RecipeHero: React.FC<RecipeHeroProps> = ({
  recipe,
  onSidebarToggle,
  onEdit,
  onDelete,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [heartBounce, setHeartBounce] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number>(1.5); // Default 3:2
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect natural aspect ratio of the image to prevent stretching/pixelation
  // Using useLayoutEffect to minimize layout shifts by updating before paint
  useLayoutEffect(() => {
    if (!recipe.image) return;
    const img = new Image();
    img.src = recipe.image;
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setAspectRatio(img.naturalWidth / img.naturalHeight);
      }
    };
  }, [recipe.image]);

  const toggleFavorite = useMutation(
    api.recipes.toggleFavorite,
  ).withOptimisticUpdate((localStore, args) => {
    const { id } = args;
    const currentRecipe = localStore.getQuery(api.recipes.get, { id });
    if (currentRecipe) {
      localStore.setQuery(
        api.recipes.get,
        { id },
        { ...currentRecipe, isFavorite: !currentRecipe.isFavorite },
      );
    }
  });

  // Memoize favorite handler to prevent re-renders of IconButton
  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      setHeartBounce(true);
      setTimeout(() => setHeartBounce(false), 1000);

      try {
        await toggleFavorite({ id: recipe._id });
        if (!recipe.isFavorite && navigator.vibrate) {
          navigator.vibrate(50);
        }
      } catch (error) {
        console.error("Fehler beim Umschalten der Favoriten:", error);
      }
    },
    [recipe._id, toggleFavorite, recipe.isFavorite],
  );

  // Memoize plan modal handler
  const handleOpenPlanModal = useCallback(() => {
    setIsPlanModalOpen(true);
  }, []);

  // Memoize menu toggle handler
  const handleToggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  // Memoize edit handler
  const handleEdit = useCallback(() => {
    setIsMenuOpen(false);
    onEdit();
  }, [onEdit]);

  // Memoize delete handler
  const handleDeleteClick = useCallback(() => {
    setIsMenuOpen(false);
    setIsDeleteConfirmOpen(true);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="flex flex-col w-full bg-white group/hero">
      {/* Sticky Top Header (Statusbar-Schutz + Navigation) */}
      <div className="sticky top-0 z-40 w-full">
        {/* Weißer Notch-Schutz */}
        <div className="w-full bg-white h-[env(safe-area-inset-top)]" />
        
        {/* Icons - absolut positioniert unter dem weißen Balken, aber sticky mit ihm */}
        <div className="absolute top-full left-0 right-0 px-4 pt-2 pointer-events-none">
          <div className="flex items-center justify-between pointer-events-auto">
            {/* Back Button */}
            <IconButton
              icon="arrow_back"
              onClick={onSidebarToggle}
              ariaLabel="Zurück"
              title="Zurück"
              variant="glass"
            />

            <div className="flex items-center gap-1">
              {/* Favorite Button */}
              <IconButton
                icon="favorite"
                onClick={handleToggleFavorite}
                isFilled={recipe.isFavorite}
                animateBounce={heartBounce}
                ariaLabel={
                  recipe.isFavorite
                    ? "Aus Favoriten entfernen"
                    : "Zu Favoriten hinzufügen"
                }
                ariaPressed={recipe.isFavorite}
                title={
                  recipe.isFavorite
                    ? "Aus Favoriten entfernen"
                    : "Zu Favoriten hinzufügen"
                }
                variant="glass"
              />

              {/* Add to Plan Button */}
              <IconButton
                icon="bookmark_add"
                onClick={handleOpenPlanModal}
                ariaLabel="Zum Wochenplan hinzufügen"
                title="Zum Wochenplan hinzufügen"
                variant="glass"
              />

              {/* Menu Button */}
              <div className="relative z-20" ref={menuRef}>
                <IconButton
                  icon="more_vert"
                  onClick={handleToggleMenu}
                  ariaLabel="Mehr Optionen"
                  title="Mehr Optionen"
                  variant="glass"
                />

                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden origin-top-right animate-in fade-in zoom-in-95 duration-200 z-50">
                    <div className="p-1.5">
                      <button
                        onClick={handleEdit}
                        className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-3 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg opacity-70">
                          edit
                        </span>
                        Rezept bearbeiten
                      </button>

                      <div className="h-px bg-gray-100 my-1 mx-2" />

                      <button
                        onClick={handleDeleteClick}
                        className="w-full text-left px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-3 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg opacity-70">
                          delete
                        </span>
                        Rezept löschen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Image Container */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: `${aspectRatio}`,
          minHeight: "20vh",
          maxHeight: "75vh",
          maskImage: EASED_MASK_GRADIENT,
          WebkitMaskImage: EASED_MASK_GRADIENT,
        }}
      >
        <div
          className="absolute inset-0 w-full h-full cursor-zoom-in active:scale-[0.99] transition-transform duration-300"
          onClick={() => setIsZoomOpen(true)}
        >
          <ImageWithBlurhash
            className="w-full h-full object-cover object-center"
            alt={recipe.imageAlt}
            src={recipe.image}
            blurhash={recipe.imageBlurhash}
            fetchPriority="high"
          />
          {/* Subtle hint for zoom */}
          <div className="absolute inset-0 bg-black/0 group-hover/hero:bg-black/10 transition-colors flex items-center justify-center">
            <span className="material-symbols-outlined text-white opacity-0 group-hover/hero:opacity-100 transition-opacity !text-4xl scale-75 group-hover/hero:scale-100 duration-300">
              zoom_in
            </span>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <MealPlanModal
          isOpen={isPlanModalOpen}
          onClose={() => setIsPlanModalOpen(false)}
          mode="selectDay"
          recipeId={recipe._id}
          recipeTitle={recipe.title}
          recipeImage={recipe.image}
          weekStartDate={undefined} // Let modal manage its own week
        />
      </Suspense>

      <Suspense fallback={null}>
        <ImageZoomModal
          isOpen={isZoomOpen}
          onClose={() => setIsZoomOpen(false)}
          src={recipe.image}
          alt={recipe.imageAlt}
        />
      </Suspense>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setIsDeleteConfirmOpen(false)}
            />
            <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center">
                <div className="size-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-3xl">
                    delete_forever
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Rezept löschen?
                </h3>
                <p className="text-sm text-gray-500 mb-6 font-medium">
                  Soll das Rezept "{recipe.title}" wirklich unwiderruflich
                  gelöscht werden?
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => setIsDeleteConfirmOpen(false)}
                    className="flex-1 py-3 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={() => {
                      setIsDeleteConfirmOpen(false);
                      onDelete();
                    }}
                    className="flex-1 py-3 rounded-xl font-bold bg-red-600 text-white shadow-lg shadow-red-600/20 active:scale-95 transition-all"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default RecipeHero;
