import type { SkImage } from '@shopify/react-native-skia';
import type { CameraView } from 'expo-camera';
import Constants from 'expo-constants';

import type { AppSettings } from '../../types/settings';
import { AppError, logError } from '../../utils/errors';
import { captureFileName, formatExifOffset, formatUtcOffset } from '../../utils/format';
import { addCapture, type CaptureRecord } from '../gallery/mediaRepository';
import { addressLine, addressTitle } from '../location/addressFormat';
import type { CaptureLocation } from '../location/locationTypes';
import type { ExifInput } from '../media/exifWriter';
import { saveToLibrary } from '../media/mediaLibraryService';
import { clearPending, markPending } from '../media/recoveryService';
import { copyAs, deleteQuietly, hasFreeSpace } from '../media/temporaryFileService';
import { stampPhoto } from '../stamping/photoStampProcessor';
import type { StampFonts } from '../stamping/stampRenderer';
import { buildStampContent, stampStyleFrom } from '../stamping/stampTemplates';

export interface PhotoCaptureContext {
  settings: AppSettings;
  location: CaptureLocation;
  fonts: StampFonts;
  timeZone: string | null;
  /** Builds the mini map for the capture coordinates (called after the shutter fires). */
  mapProvider: (latitude: number, longitude: number) => Promise<SkImage | null>;
  logoImage: SkImage | null;
}

export interface PhotoCaptureResult {
  record: CaptureRecord;
  /** Non-fatal problem the user should know about (e.g. stamp failed, original kept). */
  warning: AppError | null;
}

const SOFTWARE = `GEO-CAM ${Constants.expoConfig?.version ?? ''}`.trim();

/** Rough upper bound of the space a capture needs while processing. */
const PHOTO_SPACE_BYTES = 40 * 1024 * 1024;

export function exifFor(capturedAt: Date, location: CaptureLocation): Omit<ExifInput, 'width' | 'height'> {
  const reading = location.freshness !== 'unavailable' ? location.reading : null;
  return {
    capturedAt,
    utcOffset: formatExifOffset(capturedAt),
    software: SOFTWARE,
    gps: reading
      ? {
          latitude: reading.latitude,
          longitude: reading.longitude,
          altitude: reading.altitude,
          accuracy: reading.accuracy,
          timestamp: reading.timestamp,
          heading: location.heading,
        }
      : null,
  };
}

export function recordLocation(location: CaptureLocation): CaptureRecord['location'] {
  const reading = location.reading;
  if (!reading || location.freshness === 'unavailable') return null;
  return {
    latitude: reading.latitude,
    longitude: reading.longitude,
    accuracy: reading.accuracy,
    altitude: reading.altitude,
    timestamp: reading.timestamp,
    freshness: location.freshness,
    ageMs: location.ageMs,
    mocked: reading.mocked,
  };
}

/**
 * Full photo pipeline: capture → freeze location → stamp in temp storage →
 * validate → save to the system library → record → clean up.
 * The camera's original file is only deleted after everything succeeded.
 */
export async function captureAndSavePhoto(
  camera: CameraView,
  context: PhotoCaptureContext,
  onCaptured?: () => void,
): Promise<PhotoCaptureResult> {
  const { settings, location } = context;
  if (!hasFreeSpace(PHOTO_SPACE_BYTES)) throw new AppError('low-storage');

  const capturedAt = new Date();
  let picture: Awaited<ReturnType<CameraView['takePictureAsync']>>;
  try {
    picture = await camera.takePictureAsync({
      quality: 1,
      exif: false,
      shutterSound: settings.camera.shutterSound,
    });
  } catch (error) {
    logError('takePictureAsync', error);
    throw new AppError('capture-failed', error);
  }
  if (!picture?.uri) throw new AppError('capture-failed');
  onCaptured?.();

  const baseName = captureFileName(capturedAt, 'jpg');
  const exif = exifFor(capturedAt, location);
  const recordBase = {
    kind: 'photo' as const,
    fileName: baseName,
    capturedAt: capturedAt.getTime(),
    durationMs: null,
    videoStampMode: null,
    location: recordLocation(location),
    addressTitle: location.address ? addressTitle(location.address) : null,
    addressLine: location.address ? addressLine(location.address) : null,
    utcOffset: formatUtcOffset(capturedAt),
    timeZone: context.timeZone,
  };
  // Journal the capture so the original survives if the app is killed mid-processing.
  const pendingId = `${baseName}-${capturedAt.getTime()}`;
  await markPending({
    id: pendingId,
    kind: 'photo',
    sourceUri: picture.uri,
    fileName: baseName,
    record: { ...recordBase, width: picture.width, height: picture.height },
  });
  // The camera's original is only removed once something has been saved.
  const tempUris: string[] = [];
  let savedToLibrary = false;
  let warning: AppError | null = null;

  try {
    let finalUri = picture.uri;
    let width = picture.width;
    let height = picture.height;
    let stamped = false;

    try {
      const reading = location.freshness !== 'unavailable' ? location.reading : null;
      const mapImage =
        settings.stamp.enabled && settings.stamp.showMap && reading
          ? await context.mapProvider(reading.latitude, reading.longitude)
          : null;
      const result = await stampPhoto({
        sourceUri: picture.uri,
        outputName: baseName,
        stamp: settings.stamp.enabled
          ? {
              content: buildStampContent(location, capturedAt, settings.stamp, context.timeZone),
              style: stampStyleFrom(settings.stamp),
              mapImage,
              logoImage: context.logoImage,
            }
          : null,
        fonts: context.fonts,
        quality: settings.storage.photoQuality,
        exif,
      });
      tempUris.push(result.uri);
      finalUri = result.uri;
      width = result.width;
      height = result.height;
      stamped = settings.stamp.enabled;
    } catch (error) {
      if (error instanceof AppError && error.code === 'low-storage') throw error;
      // Keep the photo: save the camera's original instead and tell the user.
      warning = new AppError(
        error instanceof AppError && error.code === 'image-too-large' ? 'image-too-large' : 'photo-processing-failed',
        error,
      );
      finalUri = await copyAs(picture.uri, baseName);
      tempUris.push(finalUri);
    }

    const saved = await saveToLibrary(finalUri);
    savedToLibrary = true;

    let originalAssetId: string | null = null;
    if (settings.storage.saveOriginal && stamped) {
      try {
        const originalUri = await copyAs(picture.uri, captureFileName(capturedAt, 'jpg', '_original'));
        tempUris.push(originalUri);
        originalAssetId = (await saveToLibrary(originalUri)).assetId;
      } catch (error) {
        logError('save original', error);
      }
    }

    const record: CaptureRecord = {
      ...recordBase,
      assetId: saved.assetId,
      width,
      height,
      stamped,
      stampIssue: warning ? warning.code : null,
      originalAssetId,
    };
    await addCapture(record);
    return { record, warning };
  } finally {
    tempUris.forEach(deleteQuietly);
    if (savedToLibrary) {
      deleteQuietly(picture.uri);
      await clearPending(pendingId);
    }
  }
}
