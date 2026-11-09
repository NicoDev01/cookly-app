"use node";
import { v } from "convex/values";
import sharp from "sharp";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { RECIPE_THUMBNAIL_WIDTH } from "../utils/imageUrl";

export const generate = internalAction({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const sourceId = await ctx.runQuery(internal.recipeThumbnails.getThumbnailSource, { recipeId: args.recipeId });
    if (!sourceId) return;
    const source = await ctx.storage.get(sourceId);
    if (!source) return;

    let thumbnail: Buffer;
    try {
      thumbnail = await sharp(Buffer.from(await source.arrayBuffer()), { failOn: "none" })
        .rotate()
        .resize({ width: RECIPE_THUMBNAIL_WIDTH, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
    } catch (error) {
      console.warn("[thumbnail] Bild nicht lesbar", args.recipeId, error instanceof Error ? error.message : error);
      return;
    }

    const thumbId = await ctx.storage.store(new Blob([new Uint8Array(thumbnail)], { type: "image/webp" }));
    await ctx.runMutation(internal.recipeThumbnails.saveThumbnail, { recipeId: args.recipeId, sourceId, thumbId });
  },
});
