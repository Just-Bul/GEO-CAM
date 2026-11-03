import type { CameraView } from 'expo-camera';

import { logError } from '../../utils/errors';
import { createStore } from '../../utils/store';

/** Picture sizes the current camera reports, largest first (4:3 only on Android). */
export const pictureSizesStore = createStore<string[]>([]);

/** Above this the stamping step would need too much memory on typical phones. */
const MAX_PIXELS = 50_000_000;

export function parseSize(size: string): { width: number; height: number } | null {
  const match = /^(\d+)x(\d+)$/.exec(size);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function isFourByThree(size: { width: number; height: number }) {
  const ratio = Math.max(size.width, size.height) / Math.min(size.width, size.height);
  return Math.abs(ratio - 4 / 3) < 0.02;
}

/**
 * Normalises what the platform reports.
 * - Android: "WxH" strings. Only 4:3 sizes are kept, because the photo preview
 *   frame is 3:4 and the stamp preview must match the saved image.
 * - iOS: session presets ("Photo", "High", …) plus "WxH" video sizes; "Photo"
 *   is the full-resolution 4:3 still preset.
 */
export function usablePictureSizes(reported: string[]): string[] {
  if (reported.includes('Photo')) return ['Photo'];
  return reported
    .map((size) => ({ size, parsed: parseSize(size) }))
    .filter((item): item is { size: string; parsed: { width: number; height: number } } =>
      item.parsed != null && isFourByThree(item.parsed) && item.parsed.width * item.parsed.height <= MAX_PIXELS,
    )
    .sort((a, b) => b.parsed.width * b.parsed.height - a.parsed.width * a.parsed.height)
    .map((item) => item.size);
}

/** Size to request from the camera for a setting ("max" or a specific size). */
export function resolvePictureSize(setting: string, sizes: string[]): string | undefined {
  if (!sizes.length) return undefined;
  if (setting !== 'max' && sizes.includes(setting)) return setting;
  return sizes[0];
}

export async function loadPictureSizes(camera: CameraView | null): Promise<string[]> {
  if (!camera) return pictureSizesStore.get();
  try {
    const sizes = usablePictureSizes(await camera.getAvailablePictureSizesAsync());
    pictureSizesStore.set(sizes);
    return sizes;
  } catch (error) {
    logError('getAvailablePictureSizesAsync', error);
    return pictureSizesStore.get();
  }
}

export function megapixels(size: string): string {
  const parsed = parseSize(size);
  if (!parsed) return size;
  return `${((parsed.width * parsed.height) / 1_000_000).toFixed(1)} MP (${parsed.width}×${parsed.height})`;
}
