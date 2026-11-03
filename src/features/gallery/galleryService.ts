import { File } from 'expo-file-system';
import { Asset } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { shareFiles } from '../../../modules/video-stamping';
import { AppError, logError } from '../../utils/errors';
import { deleteAssets } from '../media/mediaLibraryService';
import { deleteQuietly, tempFile } from '../media/temporaryFileService';
import { removeCaptures, type CaptureRecord } from './mediaRepository';

/** A URI the player/image viewer can open (iOS videos need a file URL, not ph://). */
export async function resolveMediaUri(record: CaptureRecord): Promise<string> {
  try {
    return await new Asset(record.assetId).getUri();
  } catch (error) {
    logError('resolveMediaUri', error);
    throw new AppError('invalid-media-file', error);
  }
}

/** Whether the asset still exists in the library (it may have been deleted elsewhere). */
export async function assetExists(assetId: string): Promise<boolean> {
  try {
    await new Asset(assetId).getInfo();
    return true;
  } catch {
    return false;
  }
}

/** Opens the system share sheet. A temporary copy is shared and removed afterwards. */
export async function shareCapture(record: CaptureRecord) {
  if (!(await Sharing.isAvailableAsync())) throw new AppError('share-unavailable');
  const source = await resolveMediaUri(record);
  let copy: string | null = null;
  try {
    const destination = tempFile(record.fileName);
    await new File(source).copy(destination);
    copy = destination.uri;
    await Sharing.shareAsync(copy, {
      mimeType: record.kind === 'photo' ? 'image/jpeg' : 'video/mp4',
      dialogTitle: 'Share',
      UTI: record.kind === 'photo' ? 'public.jpeg' : 'public.mpeg-4',
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('shareCapture', error);
    throw new AppError('share-unavailable', error);
  } finally {
    // Deleting right away can break slow receiving apps on Android; stale copies
    // are removed by the regular temporary-file cleanup instead.
    if (copy && record.kind === 'video') setTimeout(() => deleteQuietly(copy), 10 * 60 * 1000);
  }
}

function shareMimeType(records: CaptureRecord[]): string {
  if (records.every((r) => r.kind === 'photo')) return records.length === 1 ? 'image/jpeg' : 'image/*';
  if (records.every((r) => r.kind === 'video')) return records.length === 1 ? 'video/mp4' : 'video/*';
  return '*/*';
}

/**
 * Opens the system share sheet for one or more captures.
 * Android shares the gallery items directly (no copies); iOS shares temporary
 * file copies, because Photos identifiers cannot be handed to other apps.
 */
export async function shareCaptures(records: CaptureRecord[]) {
  if (!records.length) return;
  const title = records.length === 1 ? 'Share' : `Share ${records.length} items`;
  try {
    if (Platform.OS === 'android') {
      if (await shareFiles(records.map((r) => r.assetId), shareMimeType(records), title)) return;
    } else {
      const copies: string[] = [];
      for (const record of records) {
        const destination = tempFile(record.fileName);
        await new File(await resolveMediaUri(record)).copy(destination);
        copies.push(destination.uri);
      }
      // Copies are removed by the regular temporary-file cleanup after an hour.
      if (await shareFiles(copies, shareMimeType(records), title)) return;
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('shareCaptures', error);
    throw new AppError('share-unavailable', error);
  }
  // Native share not in this build: fall back to sharing one item.
  await shareCapture(records[0]);
}

/** Deletes from the system library (the OS may ask the user to confirm) and from local records. */
export async function deleteCapture(record: CaptureRecord) {
  await deleteCaptures([record]);
}

export async function deleteCaptures(records: CaptureRecord[]) {
  const ids = records.map((r) => r.assetId);
  if (!ids.length) return;
  await deleteAssets(ids);
  await removeCaptures(ids);
}
