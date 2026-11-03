import { Directory, File, Paths } from 'expo-file-system';

import { logError } from '../../utils/errors';

/**
 * All in-progress work lives under the app's cache directory. Nothing here is
 * shared with other apps; finished media is copied to the system library and
 * the temporary copies are removed.
 */
const ROOT = 'geocam';

export function processingDirectory(): Directory {
  const directory = new Directory(Paths.cache, ROOT, 'processing');
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function tempFile(name: string): File {
  const file = new File(processingDirectory(), name);
  if (file.exists) file.delete();
  return file;
}

/** Copies a file into temporary storage under a new name (the library uses the file name). */
export async function copyAs(uri: string, name: string): Promise<string> {
  const destination = tempFile(name);
  await new File(uri).copy(destination);
  return destination.uri;
}

export function deleteQuietly(uri: string | null | undefined) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    logError('deleteQuietly', error);
  }
}

/** Bytes still free on the device's internal storage, or null if unknown. */
export function availableBytes(): number | null {
  try {
    const value = Paths.availableDiskSpace;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** True if at least `bytes` (plus a safety margin) are free. Unknown → assume enough. */
export function hasFreeSpace(bytes: number): boolean {
  const free = availableBytes();
  return free == null || free > bytes + 50 * 1024 * 1024;
}

export interface TempUsage {
  files: number;
  bytes: number;
}

function walk(directory: Directory, usage: TempUsage, olderThan: number | null, remove: boolean) {
  if (!directory.exists) return;
  for (const item of directory.list()) {
    if (item instanceof Directory) {
      walk(item, usage, olderThan, remove);
      continue;
    }
    const modified = item.modificationTime ?? 0;
    if (olderThan != null && modified > olderThan) continue;
    usage.files += 1;
    usage.bytes += item.size;
    if (remove) {
      try {
        item.delete();
      } catch (error) {
        logError('temp cleanup', error);
      }
    }
  }
}

export function temporaryUsage(): TempUsage {
  const usage = { files: 0, bytes: 0 };
  try {
    walk(new Directory(Paths.cache, ROOT), usage, null, false);
  } catch (error) {
    logError('temporaryUsage', error);
  }
  return usage;
}

/**
 * Deletes temporary files. With `olderThanMs`, only files untouched for that long
 * are removed, so work that is currently in progress is never deleted.
 */
export function cleanTemporaryFiles(olderThanMs: number | null = null): TempUsage {
  const usage = { files: 0, bytes: 0 };
  try {
    walk(
      new Directory(Paths.cache, ROOT),
      usage,
      olderThanMs == null ? null : Date.now() - olderThanMs,
      true,
    );
  } catch (error) {
    logError('cleanTemporaryFiles', error);
  }
  return usage;
}
