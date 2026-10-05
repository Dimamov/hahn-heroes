/** Shrinks a picked image file to a data URL that fits the server limits (about 700 KB for photos). */
export async function shrinkImage(file: File, maxSide: number, type: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not_image');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, 0.8);
}
