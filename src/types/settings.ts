export type StampPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
export type CoordinateFormat = 'decimal' | 'dms';
export type CameraFacing = 'back' | 'front';
export type CaptureMode = 'photo' | 'video';
export type FlashSetting = 'off' | 'on' | 'auto';
export type VideoQualitySetting = '2160p' | '1080p' | '720p' | '480p';
export type VideoStampMode = 'fixed' | 'dynamic';

export interface StampSettings {
  /** When false, media is saved without a stamp. */
  enabled: boolean;
  showLocationName: boolean;
  showAddress: boolean;
  showCoordinates: boolean;
  showDate: boolean;
  showTime: boolean;
  showTimezone: boolean;
  showAccuracy: boolean;
  showAltitude: boolean;
  showMap: boolean;
  showCompass: boolean;
  showFlag: boolean;
  /** Small GEO-CAM emblem badge on the stamp. */
  showLogo: boolean;
  watermark: string;
  note: string;
  position: StampPosition;
  /** Stamp panel width as a multiplier of the default width (0.7 – 1.4). */
  size: number;
  /** Text size multiplier (0.8 – 1.4). */
  textSize: number;
  /** Background opacity 0 – 1. */
  backgroundOpacity: number;
  textColor: string;
  coordinateFormat: CoordinateFormat;
  use24HourTime: boolean;
}

export interface CameraSettings {
  defaultFacing: CameraFacing;
  defaultMode: CaptureMode;
  flash: FlashSetting;
  /** `max` uses the largest size the device reports; otherwise a size string from the camera. */
  pictureSize: string;
  videoQuality: VideoQualitySetting;
  showGrid: boolean;
  recordAudio: boolean;
  shutterSound: boolean;
  /** Remember the last zoom level between sessions. */
  rememberZoom: boolean;
  lastZoom: number;
  videoStampMode: VideoStampMode;
}

export interface LocationSettings {
  /** Allow a recent cached reading when no live fix is available. */
  allowCachedLocation: boolean;
  /** Readings older than this many seconds are treated as cached (not current). */
  currentMaxAgeSec: number;
  /** Cached readings older than this many minutes are not used at all. */
  cachedMaxAgeMin: number;
}

export interface StorageSettings {
  /** Also save the unstamped original next to the stamped copy. */
  saveOriginal: boolean;
  /** JPEG quality 0.5 – 1. */
  photoQuality: number;
}

export interface PrivacySettings {
  /** Strict offline mode: no geocoding or map network requests. */
  offlineMode: boolean;
  /** Allow address lookup through the platform geocoder (needs network). */
  allowAddressLookup: boolean;
  /** Allow online map tiles (Phase 7). */
  allowOnlineMaps: boolean;
  /** The one-time "show a map?" question has been answered. */
  mapPromptShown: boolean;
}

export interface AppSettings {
  version: 1;
  camera: CameraSettings;
  stamp: StampSettings;
  location: LocationSettings;
  storage: StorageSettings;
  privacy: PrivacySettings;
}
