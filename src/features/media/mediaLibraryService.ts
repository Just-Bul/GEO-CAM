import {
  Album,
  Asset,
  AssetField,
  getPermissionsAsync,
  Query,
  requestPermissionsAsync,
  type PermissionResponse,
} from 'expo-media-library';
import { Platform } from 'react-native';

import { AppError, logError } from '../../utils/errors';

export const ALBUM_NAME = 'Geo Camera';

export type MediaAccess = 'undetermined' | 'all' | 'limited' | 'denied' | 'blocked';

const GRANULAR: ('photo' | 'video')[] = ['photo', 'video'];

function accessFrom(response: PermissionResponse): MediaAccess {
  if (response.granted) return response.accessPrivileges === 'limited' ? 'limited' : 'all';
  if (response.status === 'undetermined') return 'undetermined';
  return response.canAskAgain ? 'denied' : 'blocked';
}

export async function getMediaAccess(): Promise<MediaAccess> {
  try {
    return accessFrom(await getPermissionsAsync(false, GRANULAR));
  } catch (error) {
    logError('media getPermissions', error);
    return 'undetermined';
  }
}

/** Asks for library access the first time something is about to be saved or shown. */
export async function requestMediaAccess(): Promise<MediaAccess> {
  try {
    const current = await getPermissionsAsync(false, GRANULAR);
    if (current.granted || !current.canAskAgain) return accessFrom(current);
    return accessFrom(await requestPermissionsAsync(false, GRANULAR));
  } catch (error) {
    logError('media requestPermissions', error);
    return 'denied';
  }
}

let albumCache: Album | null = null;

async function findAlbum(): Promise<Album | null> {
  if (albumCache) return albumCache;
  try {
    albumCache = await Album.get(ALBUM_NAME);
  } catch (error) {
    logError('Album.get', error);
    albumCache = null;
  }
  return albumCache;
}

export interface SavedAsset {
  assetId: string;
}

/**
 * Copies a finished local file into the system library (Android MediaStore /
 * iOS Photos), inside the "Geo Camera" album when the platform allows it.
 * Resolves only after the library reports the new asset.
 */
export async function saveToLibrary(fileUri: string): Promise<SavedAsset> {
  const access = await requestMediaAccess();
  if (access === 'denied' || access === 'blocked' || access === 'undetermined') {
    throw new AppError('media-permission-denied');
  }

  try {
    const album = await findAlbum();
    if (album) {
      const asset = await Asset.create(fileUri, album);
      return { assetId: asset.id };
    }
    const asset = await Asset.create(fileUri);
    try {
      // First save: create the album around the new asset (moved, not duplicated, on Android).
      albumCache = await Album.create(ALBUM_NAME, [asset], true);
    } catch (error) {
      // Album creation can be refused (e.g. limited access on some iOS versions);
      // the asset itself is already safely in the library.
      logError('Album.create', error);
    }
    return { assetId: asset.id };
  } catch (error) {
    albumCache = null;
    logError('saveToLibrary', error);
    const message = String((error as Error)?.message ?? '').toLowerCase();
    if (message.includes('space') || message.includes('enospc') || message.includes('storage full')) {
      throw new AppError('low-storage', error);
    }
    if (message.includes('permission') || message.includes('denied')) {
      throw new AppError('media-permission-denied', error);
    }
    throw new AppError('gallery-save-failed', error);
  }
}

/** Assets in the app's album, newest first. */
export async function listAlbumAssets(limit = 500): Promise<Asset[]> {
  const album = await findAlbum();
  if (!album) return [];
  try {
    return await new Query()
      .album(album)
      .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
      .limit(limit)
      .exe();
  } catch (error) {
    albumCache = null;
    logError('album.getAssets', error);
    return [];
  }
}

export async function deleteAssets(assetIds: string[]): Promise<void> {
  try {
    await Asset.delete(assetIds.map((id) => new Asset(id)));
  } catch (error) {
    logError('Asset.delete', error);
    throw new AppError('delete-failed', error);
  }
}

export function resetAlbumCache() {
  albumCache = null;
}

export const isIOS = Platform.OS === 'ios';
