'use client';

/**
 * Downscale any picked image to a square 256px JPEG data-URL (base64).
 * Keeps payloads small (~15-40KB) so the profile avatar saves instantly
 * via PATCH /api/auth/me without a separate upload endpoint.
 */
export async function fileToAvatarDataUrl(file: File, maxBytes = 140_000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 256, 256);
  bitmap.close?.();
  let quality = 0.85;
  let url = canvas.toDataURL('image/jpeg', quality);
  while (url.length > maxBytes && quality > 0.4) {
    quality -= 0.12;
    url = canvas.toDataURL('image/jpeg', quality);
  }
  return url;
}
