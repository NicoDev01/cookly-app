import { encode } from "blurhash";

const loadImage = async (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (...args) => reject(args);
    img.crossOrigin = "Anonymous"; // Important for external images
    img.src = src;
  });

const getImageData = (image: HTMLImageElement): ImageData => {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get canvas context");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
};

export const encodeImageToBlurhash = async (imageUrl: string): Promise<string> => {
  const image = await loadImage(imageUrl);
  const imageData = getImageData(image);
  // 4x3 components is a good balance for most images
  return encode(imageData.data, imageData.width, imageData.height, 4, 3);
};
