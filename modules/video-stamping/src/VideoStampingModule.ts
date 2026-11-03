import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface VideoInfo {
  /** Display width (rotation already applied). */
  width: number;
  /** Display height (rotation already applied). */
  height: number;
  rotation: number;
  durationMs: number;
  hasAudio: boolean;
  bitrate: number | null;
  frameRate: number | null;
}

export interface VideoOverlay {
  /** file:// URI of a PNG rendered for the upright frame. */
  uri: string;
  startMs: number;
  endMs: number;
  /** Top-left position in pixels of the upright frame. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StampOptions {
  inputUri: string;
  outputUri: string;
  overlays: VideoOverlay[];
}

export interface StampResult {
  outputUri: string;
  durationMs: number;
  fileSizeBytes: number;
}

type Events = {
  onProgress: (event: { jobId: string; progress: number }) => void;
};

declare class VideoStampingNativeModule extends NativeModule<Events> {
  isAvailable: boolean;
  getVideoInfoAsync(uri: string): Promise<VideoInfo>;
  stampVideoAsync(jobId: string, options: StampOptions): Promise<StampResult>;
  cancelAsync(jobId: string): Promise<void>;
  /** System share sheet for several items (Android: content URIs, iOS: file URLs). */
  shareFilesAsync(uris: string[], mimeType: string, title: string): Promise<void>;
  /** Android only: inserts into Movies/<album> via MediaStore and returns the content URI. */
  saveVideoToMoviesAsync(fileUri: string, albumName: string): Promise<string>;
}

/** Null when the native module is not part of this build (e.g. Expo Go). */
export default requireOptionalNativeModule<VideoStampingNativeModule>('VideoStamping');
