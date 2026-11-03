import type { AppSettings } from '../../types/settings';

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  camera: {
    defaultFacing: 'back',
    defaultMode: 'photo',
    flash: 'off',
    pictureSize: 'max',
    videoQuality: '1080p',
    showGrid: false,
    recordAudio: true,
    shutterSound: true,
    rememberZoom: false,
    lastZoom: 0,
    videoStampMode: 'fixed',
  },
  stamp: {
    enabled: true,
    showLocationName: true,
    showAddress: true,
    showCoordinates: true,
    showDate: true,
    showTime: true,
    showTimezone: true,
    showAccuracy: true,
    showAltitude: false,
    showMap: true,
    showCompass: false,
    showFlag: false,
    showLogo: true,
    watermark: '',
    note: '',
    position: 'bottom-left',
    size: 1,
    textSize: 1,
    backgroundOpacity: 0.55,
    textColor: '#FFFFFF',
    coordinateFormat: 'decimal',
    use24HourTime: false,
  },
  location: {
    allowCachedLocation: true,
    currentMaxAgeSec: 30,
    cachedMaxAgeMin: 30,
  },
  storage: {
    saveOriginal: false,
    photoQuality: 0.92,
  },
  privacy: {
    offlineMode: false,
    allowAddressLookup: true,
    allowOnlineMaps: false,
    mapPromptShown: false,
  },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function pickSection<T extends object>(defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== 'object') return { ...defaults };
  const result = { ...defaults } as Record<string, unknown>;
  const source = stored as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    const fallback = (defaults as Record<string, unknown>)[key];
    const value = source[key];
    // Only accept values whose type matches the default, so a corrupted or
    // outdated entry can never put the app into an invalid state.
    if (value !== undefined && typeof value === typeof fallback) {
      result[key] = value;
    }
  }
  return result as T;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Merge persisted data onto the defaults and clamp every numeric range. */
export function sanitizeSettings(stored: unknown): AppSettings {
  const source = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const settings: AppSettings = {
    version: 1,
    camera: pickSection(DEFAULT_SETTINGS.camera, source.camera),
    stamp: pickSection(DEFAULT_SETTINGS.stamp, source.stamp),
    location: pickSection(DEFAULT_SETTINGS.location, source.location),
    storage: pickSection(DEFAULT_SETTINGS.storage, source.storage),
    privacy: pickSection(DEFAULT_SETTINGS.privacy, source.privacy),
  };

  const { camera, stamp, location, storage } = settings;
  if (!['back', 'front'].includes(camera.defaultFacing)) camera.defaultFacing = 'back';
  if (!['photo', 'video'].includes(camera.defaultMode)) camera.defaultMode = 'photo';
  if (!['off', 'on', 'auto'].includes(camera.flash)) camera.flash = 'off';
  // Resolution is not user-selectable (kept simple): best photo size, 1080p video.
  camera.pictureSize = 'max';
  camera.videoQuality = '1080p';
  if (!['fixed', 'dynamic'].includes(camera.videoStampMode)) camera.videoStampMode = 'fixed';
  camera.lastZoom = clamp(camera.lastZoom, 0, 1);

  if (!['bottom-left', 'bottom-right', 'top-left', 'top-right'].includes(stamp.position)) {
    stamp.position = 'bottom-left';
  }
  if (!['decimal', 'dms'].includes(stamp.coordinateFormat)) stamp.coordinateFormat = 'decimal';
  stamp.size = clamp(stamp.size, 0.7, 1.4);
  stamp.textSize = clamp(stamp.textSize, 0.8, 1.4);
  stamp.backgroundOpacity = clamp(stamp.backgroundOpacity, 0, 1);
  if (!HEX_COLOR.test(stamp.textColor)) stamp.textColor = DEFAULT_SETTINGS.stamp.textColor;
  stamp.watermark = stamp.watermark.slice(0, 60);
  stamp.note = stamp.note.slice(0, 120);

  location.currentMaxAgeSec = clamp(Math.round(location.currentMaxAgeSec), 5, 300);
  location.cachedMaxAgeMin = clamp(Math.round(location.cachedMaxAgeMin), 1, 24 * 60);

  storage.photoQuality = clamp(storage.photoQuality, 0.5, 1);
  return settings;
}
