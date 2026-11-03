export type AppErrorCode =
  | 'camera-permission-denied'
  | 'camera-not-ready'
  | 'camera-init-failed'
  | 'capture-failed'
  | 'recording-failed'
  | 'recording-too-short'
  | 'location-permission-denied'
  | 'location-services-disabled'
  | 'location-unavailable'
  | 'media-permission-denied'
  | 'media-permission-limited'
  | 'gallery-save-failed'
  | 'photo-processing-failed'
  | 'image-too-large'
  | 'video-processing-failed'
  | 'video-processing-cancelled'
  | 'video-processing-unavailable'
  | 'unsupported-format'
  | 'low-storage'
  | 'invalid-media-file'
  | 'share-unavailable'
  | 'delete-failed'
  | 'unknown';

const MESSAGES: Record<AppErrorCode, string> = {
  'camera-permission-denied':
    'GEO-CAM needs camera access to take photos. You can allow it in your device settings.',
  'camera-not-ready': 'The camera is still starting. Please try again in a moment.',
  'camera-init-failed':
    'The camera could not be started. Another app may be using it. Close other camera apps and try again.',
  'capture-failed': 'The photo could not be taken. Please try again.',
  'recording-failed': 'The video could not be recorded. Please try again.',
  'recording-too-short': 'The recording was too short to save.',
  'location-permission-denied':
    'Location access is off, so photos will not include your location. You can allow it in your device settings.',
  'location-services-disabled':
    'Location services are turned off on this device. Turn them on to add your location to photos.',
  'location-unavailable': 'Your location is not available right now.',
  'media-permission-denied':
    'GEO-CAM needs permission to save to your photo library. You can allow it in your device settings.',
  'media-permission-limited':
    'GEO-CAM can only see some of your photos. New captures are still saved to your library.',
  'gallery-save-failed': 'The file could not be saved to your photo library. Please try again.',
  'photo-processing-failed':
    'The location stamp could not be added to this photo. Your original photo was kept.',
  'image-too-large':
    'This photo is too large to stamp on this device. Choose a smaller resolution in Settings.',
  'video-processing-failed':
    'The location stamp could not be added to this video. Your original recording was kept.',
  'video-processing-cancelled': 'Video processing was cancelled. Your original recording was kept.',
  'video-processing-unavailable':
    'Stamped video export is not available in this build. The video was saved without a stamp.',
  'unsupported-format': 'This device does not support the selected format. Try a different setting.',
  'low-storage': 'Your device is almost out of storage. Free up some space and try again.',
  'invalid-media-file': 'The media file is missing or damaged.',
  'share-unavailable': 'Sharing is not available on this device.',
  'delete-failed': 'The item could not be deleted.',
  unknown: 'Something went wrong. Please try again.',
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, cause?: unknown) {
    super(MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

/** Plain-language message for display. Raw exception text is never shown to users. */
export function userMessage(error: unknown, fallback: AppErrorCode = 'unknown'): string {
  if (error instanceof AppError) return error.message;
  return MESSAGES[fallback];
}

export function errorCode(error: unknown, fallback: AppErrorCode = 'unknown'): AppErrorCode {
  return error instanceof AppError ? error.code : fallback;
}

/** Developer-facing logging that keeps details out of the UI. */
export function logError(context: string, error: unknown) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[GeoCam] ${context}:`, error);
  }
}
