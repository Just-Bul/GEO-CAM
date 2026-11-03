import NativeVideoStamping, {
  type StampOptions,
  type StampResult,
  type VideoInfo,
  type VideoOverlay,
} from './src/VideoStampingModule';

export type { StampOptions, StampResult, VideoInfo, VideoOverlay };

export function isVideoStampingAvailable(): boolean {
  return NativeVideoStamping?.isAvailable === true;
}

export async function getVideoInfo(uri: string): Promise<VideoInfo | null> {
  if (!NativeVideoStamping) return null;
  try {
    return await NativeVideoStamping.getVideoInfoAsync(uri);
  } catch {
    return null;
  }
}

let jobCounter = 0;

/** Starts a native stamping job. Progress is reported 0–1. */
export function stampVideoNative(
  options: StampOptions,
  onProgress?: (progress: number) => void,
): { jobId: string; promise: Promise<StampResult> } {
  if (!NativeVideoStamping) throw new Error('VideoStamping native module is not available');
  jobCounter += 1;
  const jobId = `stamp-${Date.now()}-${jobCounter}`;
  const subscription = NativeVideoStamping.addListener('onProgress', (event) => {
    if (event.jobId === jobId) onProgress?.(Math.min(1, Math.max(0, event.progress)));
  });
  const promise = NativeVideoStamping.stampVideoAsync(jobId, options).finally(() => subscription.remove());
  return { jobId, promise };
}

export function cancelStampJob(jobId: string) {
  NativeVideoStamping?.cancelAsync(jobId).catch(() => {});
}

export async function saveVideoToMovies(fileUri: string, albumName: string): Promise<string> {
  if (!NativeVideoStamping) throw new Error('VideoStamping native module is not available');
  return NativeVideoStamping.saveVideoToMoviesAsync(fileUri, albumName);
}

/** Shares several files at once; false if the native module is not in this build. */
export async function shareFiles(uris: string[], mimeType: string, title: string): Promise<boolean> {
  if (!NativeVideoStamping?.shareFilesAsync) return false;
  await NativeVideoStamping.shareFilesAsync(uris, mimeType, title);
  return true;
}
