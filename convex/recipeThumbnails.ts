import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * Listen zeigen Rezeptfotos klein, die Originale sind bis zu mehrere MB groß.
 * Zu jedem hochgeladenen Foto (imageStorageId) erzeugt recipeThumbnailsNode.generate eine kleine WebP-Fassung.
 */

export const getRecipeThumbnailUrl = async (ctx: QueryCtx, recipe: Doc<"recipes">) =>
  recipe.imageStorageId && recipe.imageThumbStorageId
    ? (await ctx.storage.getUrl(recipe.imageThumbStorageId)) ?? undefined
    : undefined;

export const scheduleRecipeThumbnail = async (ctx: MutationCtx, recipeId: Id<"recipes">, delayMs = 0) => {
  await ctx.scheduler.runAfter(delayMs, internal.recipeThumbnailsNode.generate, { recipeId });
};

/** Vorschaubild löschen, wenn das Foto ersetzt, entfernt oder das Rezept gelöscht wird. Das Feld setzt der Aufrufer. */
export const deleteRecipeThumbnailFile = async (ctx: MutationCtx, recipe: Doc<"recipes">) => {
  if (!recipe.imageThumbStorageId) return;
  try {
    await ctx.storage.delete(recipe.imageThumbStorageId);
  } catch {
    // schon weg
  }
};

export const getThumbnailSource = internalQuery({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe?.imageStorageId || recipe.imageThumbStorageId) return null;
    return recipe.imageStorageId;
  },
});

export const saveThumbnail = internalMutation({
  args: { recipeId: v.id("recipes"), sourceId: v.id("_storage"), thumbId: v.id("_storage") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    // Foto inzwischen ersetzt, gelöscht oder schon versorgt: Ergebnis verwerfen.
    if (!recipe || recipe.imageStorageId !== args.sourceId || recipe.imageThumbStorageId) {
      await ctx.storage.delete(args.thumbId);
      return false;
    }
    await ctx.db.patch(args.recipeId, { imageThumbStorageId: args.thumbId });
    return true;
  },
});

/**
 * Für bestehende Rezepte: `npx convex run recipeThumbnails:backfill` (Dev) bzw. mit `--prod`.
 * Mit `'{"regenerate": true}'` werden auch vorhandene Vorschaubilder neu erzeugt (nach Änderung der Breite).
 * Plant pro Seite gestaffelt ein und ruft sich für die nächste Seite selbst auf.
 */
export const backfill = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), regenerate: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("recipes").paginate({ numItems: 100, cursor: args.cursor ?? null });
    const due = page.page.filter((recipe) => recipe.imageStorageId && (args.regenerate || !recipe.imageThumbStorageId));
    for (const [index, recipe] of due.entries()) {
      if (recipe.imageThumbStorageId) {
        await deleteRecipeThumbnailFile(ctx, recipe);
        await ctx.db.patch(recipe._id, { imageThumbStorageId: undefined });
      }
      await scheduleRecipeThumbnail(ctx, recipe._id, index * 300);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(due.length * 300, internal.recipeThumbnails.backfill, {
        cursor: page.continueCursor,
        regenerate: args.regenerate,
      });
    }
    return { scheduled: due.length, done: page.isDone };
  },
});
