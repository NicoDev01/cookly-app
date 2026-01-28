type ImageFormat = 'image/webp' | 'image/jpeg';

export const compressImage = async (
  file: File | Blob,
  maxSize = 1200,
  quality = 0.75,
  format: ImageFormat = 'image/webp'
): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, format, quality)
  );
  if (!blob) throw new Error("Bild konnte nicht komprimiert werden");
  return blob;
};

/**
 * optimizeImage - Wählt automatisch das beste Format basierend auf Dateigröße
 * Versucht WebP und fällt auf JPEG zurück, wenn WebP nicht mind. 50% kleiner ist
 */
export const optimizeImage = async (
  file: File | Blob,
  maxSize = 1200,
  quality = 0.75
): Promise<{ blob: Blob; format: ImageFormat }> => {
  // Zuerst WebP versuchen
  const webpBlob = await compressImage(file, maxSize, quality, 'image/webp');
  const originalSize = file.size;

  // WebP verwenden, wenn es >50% kleiner ist als das Original
  if (webpBlob.size < originalSize * 0.5) {
    return { blob: webpBlob, format: 'image/webp' };
  }

  // Sonst JPEG als Fallback
  const jpegBlob = await compressImage(file, maxSize, quality, 'image/jpeg');
  return { blob: jpegBlob, format: 'image/jpeg' };
};

export const uploadImageToConvexStorage = async (
  uploadUrl: string,
  blob: Blob,
  format: ImageFormat
) => {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": format,
    },
    body: blob,
  });

  if (!res.ok) {
    throw new Error(`Upload fehlgeschlagen (${res.status})`);
  }

  const json = await res.json();
  return json as { storageId: string };
};

// Legacy alias for backwards compatibility
export const uploadJpegToConvexStorage = async (uploadUrl: string, blob: Blob) => {
  return uploadImageToConvexStorage(uploadUrl, blob, 'image/jpeg');
};
