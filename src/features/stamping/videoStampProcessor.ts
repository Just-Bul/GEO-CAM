import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';

import {
  cancelStampJob,
  getVideoInfo,
  isVideoStampingAvailable,
  stampVideoNative,
  type VideoInfo,
  type VideoOverlay,
} from '../../../modules/video-stamping';
import type { AppSettings } from '../../types/settings';
import { AppError, logError } from '../../utils/errors';
import type { CaptureLocation } from '../location/locationTypes';
import { deleteQuietly, processingDirectory, tempFile } from '../media/temporaryFileService';
import { drawStamp, layoutStamp, type StampFonts } from './stampRenderer';
import { locationAt, type LocationSample } from './dynamicLocation';
import { buildStampContent, stampStyleFrom } from './stampTemplates';

export { isVideoStampingAvailable };
export type { LocationSample };


export interface VideoStampJob {
  sourceUri: string;
  outputName: string;
  recordingStartedAt: Date;
  /** Location frozen when recording started (fixed mode, and the dynamic fallback). */
  startLocation: CaptureLocation;
  /** Every live reading received while recording, oldest first. */
  samples: LocationSample[];
  settings: AppSettings;
  fonts: StampFonts;
  timeZone: string | null;
  /** Mini map for a position; called once per distinct position in the video. */
  mapProvider: (latitude: number, longitude: number) => Promise<SkImage | null>;
  logoImage: SkImage | null;
  onProgress?: (phase: 'preparing' | 'encoding', progress: number) => void;
}

export interface VideoStampHandle {
  promise: Promise<{ uri: string; info: VideoInfo }>;
  cancel: () => void;
}

const PNG = ImageFormat.PNG;

/**
 * Renders the stamp overlay bitmaps (cropped to the stamp's bounds) for a video
 * of the given display size, then asks the native module to composite them.
 */
export function stampVideo(job: VideoStampJob): VideoStampHandle {
  let cancelled = false;
  let jobId: string | null = null;
  // Settles as soon as the user cancels, so the UI never waits on the native side.
  let rejectOnCancel: (error: AppError) => void = () => {};
  const cancelSignal = new Promise<never>((_, reject) => {
    rejectOnCancel = reject;
  });
  cancelSignal.catch(() => {});
  const overlayFiles: string[] = [];

  const promise = (async () => {
    if (!isVideoStampingAvailable()) throw new AppError('video-processing-unavailable');
    const info = await getVideoInfo(job.sourceUri);
    if (!info || info.width <= 0 || info.height <= 0 || info.durationMs <= 0) {
      throw new AppError('invalid-media-file');
    }

    const { settings } = job;
    const style = stampStyleFrom(settings.stamp);
    const dynamic = settings.camera.videoStampMode === 'dynamic';
    const durationMs = info.durationMs;
    // One overlay per second keeps the clock accurate; very long videos use coarser steps.
    const stepMs = dynamic ? Math.max(1000, Math.ceil(durationMs / 1200 / 1000) * 1000) : durationMs;

    const segments: { startMs: number; endMs: number; location: CaptureLocation; at: Date }[] = [];
    for (let t = 0; t < durationMs; t += stepMs) {
      const at = new Date(job.recordingStartedAt.getTime() + (dynamic ? t : 0));
      segments.push({
        startMs: t,
        endMs: Math.min(durationMs, t + stepMs),
        location: dynamic ? locationAt(at.getTime(), job.startLocation, job.samples, settings) : job.startLocation,
        at,
      });
    }

    // Maps are built per distinct position (≈1 m grid) and reused across segments.
    const maps = new Map<string, Promise<SkImage | null>>();
    const mapFor = (location: CaptureLocation) => {
      const reading = location.freshness !== 'unavailable' ? location.reading : null;
      if (!reading) return Promise.resolve(null);
      const key = `${reading.latitude.toFixed(5)},${reading.longitude.toFixed(5)}`;
      let map = maps.get(key);
      if (!map) {
        map = job.mapProvider(reading.latitude, reading.longitude);
        maps.set(key, map);
      }
      return map;
    };

    const overlays: VideoOverlay[] = [];
    const directory = processingDirectory();
    for (let index = 0; index < segments.length; index += 1) {
      if (cancelled) throw new AppError('video-processing-cancelled');
      const segment = segments[index];
      const input = {
        content: buildStampContent(segment.location, segment.at, settings.stamp, job.timeZone),
        style,
        mapImage: settings.stamp.showMap ? await mapFor(segment.location) : null,
        logoImage: job.logoImage,
      };
      const layout = layoutStamp(Skia, job.fonts, input, info.width, info.height);
      const x = Math.max(0, Math.floor(layout.bounds.x));
      const y = Math.max(0, Math.floor(layout.bounds.y));
      const w = Math.min(info.width - x, Math.ceil(layout.bounds.width) + 2);
      const h = Math.min(info.height - y, Math.ceil(layout.bounds.height) + 2);
      const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
      if (!surface) throw new AppError('video-processing-failed');
      const canvas = surface.getCanvas();
      canvas.translate(-x, -y);
      drawStamp(Skia, job.fonts, canvas, layout, input);
      surface.flush();
      const image = surface.makeImageSnapshot();
      const bytes = image.encodeToBytes(PNG, 100);
      image.dispose();
      surface.dispose();
      const file = new File(directory, `${job.outputName}.overlay${index}.png`);
      file.create({ overwrite: true });
      file.write(bytes);
      overlayFiles.push(file.uri);
      overlays.push({ uri: file.uri, startMs: segment.startMs, endMs: segment.endMs, x, y, width: w, height: h });
      job.onProgress?.('preparing', (index + 1) / segments.length);
      // Yield so the UI can update between overlay renders.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (cancelled) throw new AppError('video-processing-cancelled');
    const output = tempFile(job.outputName);
    const native = stampVideoNative(
      { inputUri: job.sourceUri, outputUri: output.uri, overlays },
      (progress) => job.onProgress?.('encoding', progress),
    );
    jobId = native.jobId;
    const result = await Promise.race([native.promise, cancelSignal]);

    // Never trust the job blindly: confirm the output exists and is a playable video.
    const check = await getVideoInfo(result.outputUri);
    if (!check || check.durationMs <= 0 || new File(result.outputUri).size <= 0) {
      deleteQuietly(result.outputUri);
      throw new AppError('video-processing-failed');
    }
    return { uri: result.outputUri, info: check };
  })()
    .catch((error) => {
      logError('stampVideo', error);
      if (cancelled) throw new AppError('video-processing-cancelled', error);
      if (error instanceof AppError) throw error;
      const message = String((error as Error)?.message ?? '').toLowerCase();
      if (message.includes('space') || message.includes('enospc')) throw new AppError('low-storage', error);
      if (message.includes('cancel')) throw new AppError('video-processing-cancelled', error);
      if (message.includes('codec') || message.includes('format')) throw new AppError('unsupported-format', error);
      throw new AppError('video-processing-failed', error);
    })
    .finally(() => overlayFiles.forEach(deleteQuietly));

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (jobId) cancelStampJob(jobId);
      rejectOnCancel(new AppError('video-processing-cancelled'));
    },
  };
}
