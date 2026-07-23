type ImageFormat = 'image/webp' | 'image/jpeg';
export type ImageDimensions = {
  width: number;
  height: number;
  aspectRatio: number;
};

const toImageDimensions = (width: number, height: number): ImageDimensions => ({
  width,
  height,
  aspectRatio: width / height,
});

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

export const getImageDimensionsFromBlob = async (file: File | Blob): Promise<ImageDimensions> => {
  const bitmap = await createImageBitmap(file);
  const dimensions = toImageDimensions(bitmap.width, bitmap.height);
  bitmap.close();
  return dimensions;
};

export const getImageDimensionsFromUrl = (url: string): Promise<ImageDimensions> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error("Bildabmessungen konnten nicht gelesen werden"));
        return;
      }
      resolve(toImageDimensions(img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = url;
  });

export const uploadJpegToConvexStorage = async (uploadUrl: string, blob: Blob) => {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
    },
    body: blob,
  });

  if (!res.ok) {
    throw new Error(`Upload fehlgeschlagen (${res.status})`);
  }

  const json = await res.json();
  return json as { storageId: string };
};
