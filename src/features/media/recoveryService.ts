import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { isVideoStampingAvailable, saveVideoToMovies } from '../../../modules/video-stamping';
import { logError } from '../../utils/errors';
import { addCapture, type CaptureRecord } from '../gallery/mediaRepository';
import { ALBUM_NAME, saveToLibrary } from './mediaLibraryService';
import { copyAs, deleteQuietly } from './temporaryFileService';

/**
 * Journal of captures that are being processed. If the app is killed while a
 * photo or video is being stamped, the camera's original file is still in the
 * cache; on the next launch it is saved to the library (without a stamp) so the
 * user does not lose it.
 */
const KEY = 'geocam.pendingCaptures.v1';

export interface PendingCapture {
  id: string;
  kind: 'photo' | 'video';
  sourceUri: string;
  fileName: string;
  record: Omit<CaptureRecord, 'assetId' | 'stamped' | 'stampIssue' | 'originalAssetId'>;
}

async function read(): Promise<PendingCapture[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function write(entries: PendingCapture[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries)).catch(() => {});
}

export async function markPending(entry: PendingCapture) {
  const entries = await read();
  await write([...entries.filter((e) => e.id !== entry.id), entry]);
}

export async function clearPending(id: string) {
  const entries = await read();
  await write(entries.filter((e) => e.id !== id));
}

/** Saves originals of captures interrupted in a previous session. Returns how many were recovered. */
export async function recoverInterruptedCaptures(): Promise<number> {
  const entries = await read();
  if (!entries.length) return 0;
  let recovered = 0;
  const remaining: PendingCapture[] = [];
  for (const entry of entries) {
    try {
      const source = new File(entry.sourceUri);
      if (!source.exists || source.size === 0) continue; // nothing left to recover
      const copy = await copyAs(entry.sourceUri, entry.fileName);
      const assetId =
        entry.kind === 'video' && Platform.OS === 'android' && isVideoStampingAvailable()
          ? await saveVideoToMovies(copy, ALBUM_NAME)
          : (await saveToLibrary(copy)).assetId;
      deleteQuietly(copy);
      deleteQuietly(entry.sourceUri);
      await addCapture({
        ...entry.record,
        assetId,
        stamped: false,
        stampIssue: 'interrupted',
        originalAssetId: null,
      });
      recovered += 1;
    } catch (error) {
      // Keep it for the next launch (e.g. library permission not granted yet).
      logError('recoverInterruptedCaptures', error);
      remaining.push(entry);
    }
  }
  await write(remaining);
  return recovered;
}
