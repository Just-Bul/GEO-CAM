import type { SkImage } from '@shopify/react-native-skia';
import type { CameraView } from 'expo-camera';
import { Platform } from 'react-native';

import { getVideoInfo, isVideoStampingAvailable, saveVideoToMovies } from '../../../modules/video-stamping';
import type { AppSettings } from '../../types/settings';
import { AppError, logError } from '../../utils/errors';
import { captureFileName, formatUtcOffset } from '../../utils/format';
import { addCapture, type CaptureRecord } from '../gallery/mediaRepository';
import { addressLine, addressTitle } from '../location/addressFormat';
import { locationStore } from '../location/locationService';
import type { CaptureLocation } from '../location/locationTypes';
import { ALBUM_NAME, saveToLibrary } from '../media/mediaLibraryService';
import { clearPending, markPending } from '../media/recoveryService';
import { copyAs, deleteQuietly, hasFreeSpace } from '../media/temporaryFileService';
import type { StampFonts } from '../stamping/stampRenderer';
import { stampVideo, type LocationSample } from '../stamping/videoStampProcessor';
import { recordLocation } from './photoCapture';

export interface RecordingSession {
  startedAt: Date;
  startLocation: CaptureLocation;
  samples: LocationSample[];
  /** Resolves with the recorded file once recording stops. */
  done: Promise<string>;
  stop: () => void;
}

const MIN_FREE_FOR_RECORDING = 300 * 1024 * 1024;

export function startRecording(
  camera: CameraView,
  startLocation: CaptureLocation,
): RecordingSession {
  if (!hasFreeSpace(MIN_FREE_FOR_RECORDING)) throw new AppError('low-storage');
  const samples: LocationSample[] = [];
  let lastTimestamp = 0;
  // Collect every *live* reading during the recording; these are the only
  // positions a dynamic stamp may show.
  const unsubscribe = locationStore.subscribe(() => {
    const { reading, heading } = locationStore.get();
    if (reading && reading.source === 'live' && reading.timestamp > lastTimestamp) {
      lastTimestamp = reading.timestamp;
      samples.push({ reading, heading });
    }
  });
  const startedAt = new Date();
  const done = camera
    .recordAsync({})
    .then((result) => {
      if (!result?.uri) throw new AppError('recording-failed');
      return result.uri;
    })
    .catch((error) => {
      logError('recordAsync', error);
      throw error instanceof AppError ? error : new AppError('recording-failed', error);
    })
    .finally(unsubscribe);
  return {
    startedAt,
    startLocation,
    samples,
    done,
    stop: () => camera.stopRecording(),
  };
}

export interface VideoFinishContext {
  settings: AppSettings;
  fonts: StampFonts;
  timeZone: string | null;
  mapProvider: (latitude: number, longitude: number) => Promise<SkImage | null>;
  logoImage: SkImage | null;
  onProgress: (phase: 'preparing' | 'encoding', progress: number) => void;
  /** Receives a function that cancels stamping while it is running. */
  setCancel: (cancel: (() => void) | null) => void;
}

async function saveVideo(uri: string): Promise<string> {
  // Android: Movies/Geo Camera through MediaStore. iOS: Photos library.
  if (Platform.OS === 'android' && isVideoStampingAvailable()) {
    try {
      return await saveVideoToMovies(uri, ALBUM_NAME);
    } catch (error) {
      logError('saveVideoToMovies', error);
      // Fall back to the media library (Pictures/Geo Camera) rather than losing the video.
    }
  }
  return (await saveToLibrary(uri)).assetId;
}

export async function finishVideo(
  session: RecordingSession,
  context: VideoFinishContext,
): Promise<{ record: CaptureRecord; warning: AppError | null }> {
  const sourceUri = await session.done;
  const { settings } = context;
  const baseName = captureFileName(session.startedAt, 'mp4');
  const location = session.startLocation;
  const info = await getVideoInfo(sourceUri);
  if (info && info.durationMs < 300) {
    deleteQuietly(sourceUri);
    throw new AppError('recording-too-short');
  }
  const recordBase = {
    kind: 'video' as const,
    fileName: baseName,
    capturedAt: session.startedAt.getTime(),
    durationMs: info?.durationMs ?? null,
    location: recordLocation(location),
    addressTitle: location.address ? addressTitle(location.address) : null,
    addressLine: location.address ? addressLine(location.address) : null,
    utcOffset: formatUtcOffset(session.startedAt),
    timeZone: context.timeZone,
  };
  // Journal the recording so it survives if the app is killed while stamping.
  const pendingId = `${baseName}-${session.startedAt.getTime()}`;
  await markPending({
    id: pendingId,
    kind: 'video',
    sourceUri,
    fileName: baseName,
    record: { ...recordBase, width: info?.width ?? 0, height: info?.height ?? 0, videoStampMode: null },
  });
  // The camera's original is only removed once something has been saved.
  const temps: string[] = [];
  let savedToLibrary = false;
  let warning: AppError | null = null;

  try {

    let finalUri: string | null = null;
    let stamped = false;
    let width = info?.width ?? 0;
    let height = info?.height ?? 0;

    if (settings.stamp.enabled) {
      if (!isVideoStampingAvailable()) {
        warning = new AppError('video-processing-unavailable');
      } else {
        const handle = stampVideo({
          sourceUri,
          outputName: baseName,
          recordingStartedAt: session.startedAt,
          startLocation: session.startLocation,
          samples: session.samples,
          settings,
          fonts: context.fonts,
          timeZone: context.timeZone,
          mapProvider: context.mapProvider,
          logoImage: context.logoImage,
          onProgress: context.onProgress,
        });
        context.setCancel(handle.cancel);
        try {
          const result = await handle.promise;
          temps.push(result.uri);
          finalUri = result.uri;
          width = result.info.width;
          height = result.info.height;
          stamped = true;
        } catch (error) {
          if (error instanceof AppError && error.code === 'low-storage') throw error;
          // Keep the recording: the original is saved unstamped and the user is told.
          warning = error instanceof AppError ? error : new AppError('video-processing-failed', error);
        } finally {
          context.setCancel(null);
        }
      }
    }

    if (!finalUri) {
      finalUri = await copyAs(sourceUri, baseName);
      temps.push(finalUri);
    }

    const assetId = await saveVideo(finalUri);
    savedToLibrary = true;

    let originalAssetId: string | null = null;
    if (stamped && settings.storage.saveOriginal) {
      try {
        const originalUri = await copyAs(sourceUri, captureFileName(session.startedAt, 'mp4', '_original'));
        temps.push(originalUri);
        originalAssetId = await saveVideo(originalUri);
      } catch (error) {
        logError('save original video', error);
      }
    }

    const record: CaptureRecord = {
      ...recordBase,
      assetId,
      width,
      height,
      stamped,
      stampIssue: warning ? warning.code : null,
      originalAssetId,
      videoStampMode: stamped ? settings.camera.videoStampMode : null,
    };
    await addCapture(record);
    return { record, warning };
  } finally {
    temps.forEach(deleteQuietly);
    if (savedToLibrary) {
      deleteQuietly(sourceUri);
      await clearPending(pendingId);
    }
  }
}
