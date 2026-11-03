import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { logError } from '../../utils/errors';
import type { TileRef } from './tileMath';

/**
 * On-device cache of OpenStreetMap tiles.
 *
 * Follows the OSM tile usage policy (operations.osmfoundation.org/policies/tiles):
 * - a distinct User-Agent naming the app (library defaults are blocked);
 * - only tiles for the map actually being shown are fetched: no prefetching and
 *   no "download area for offline" (not allowed on this server);
 * - tiles are kept at least 7 days, so places you have been keep working offline;
 * - at most two downloads run at once.
 */
const TILE_URL: string =
  (Constants.expoConfig?.extra as { mapTileUrl?: string } | undefined)?.mapTileUrl ??
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const USER_AGENT = `GEO-CAM/${Constants.expoConfig?.version ?? '1.0.0'} (${Platform.OS}; com.eightbitbannar.geocam)`;

/**
 * Cached tiles are used without contacting the server for 30 days (OSM asks for at
 * least 7). After that they are refreshed when online; the old copy is kept if that fails.
 */
const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
/** Upper bound for the tile cache; oldest tiles are removed beyond it. */
const MAX_CACHE_BYTES = 150 * 1024 * 1024;
const MAX_PARALLEL = 2;

function root(): Directory {
  return new Directory(Paths.document, 'geocam', 'tiles', 'osm');
}

function tileFile(tile: TileRef): File {
  return new File(root(), String(tile.z), String(tile.x), `${tile.y}.png`);
}

function isPng(bytes: Uint8Array) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

const inFlight = new Map<string, Promise<File | null>>();

async function download(tile: TileRef, destination: File): Promise<File | null> {
  const url = TILE_URL.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y));
  const temp = new File(Paths.cache, 'geocam', 'tile-downloads', `${tile.z}-${tile.x}-${tile.y}.png`);
  return withSlot(async () => {
    try {
      const parent = temp.parentDirectory;
      if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
      await File.downloadFileAsync(url, temp, { headers: { 'User-Agent': USER_AGENT }, idempotent: true });
      if (!isPng(await temp.bytes())) throw new Error('Not a PNG tile');
      const dir = destination.parentDirectory;
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      if (destination.exists) destination.delete();
      // move() is asynchronous: the tile must be in place before anyone decodes it.
      await temp.move(destination);
      return destination;
    } catch (error) {
      logError(`tile ${tile.z}/${tile.x}/${tile.y}`, error);
      if (temp.exists) temp.delete();
      return null;
    }
  });
}

/**
 * Returns the cached file for a tile, downloading it only if `allowNetwork`.
 * Never returns a tile for a different location: a missing tile means no map.
 */
export async function getTile(tile: TileRef, allowNetwork: boolean): Promise<File | null> {
  const file = tileFile(tile);
  const age = file.exists ? Date.now() - (file.modificationTime ?? 0) : Infinity;
  if (file.exists && (!allowNetwork || age < REFRESH_AFTER_MS)) return file;
  if (!allowNetwork) return null;

  const key = `${tile.z}/${tile.x}/${tile.y}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = download(tile, file).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  const fresh = await pending;
  // If a refresh failed, the older cached copy is still a correct map of this place.
  return fresh ?? (file.exists ? file : null);
}

function listTiles(directory: Directory, out: File[]) {
  if (!directory.exists) return;
  for (const item of directory.list()) {
    if (item instanceof Directory) listTiles(item, out);
    else out.push(item);
  }
}

export function tileCacheUsage(): { files: number; bytes: number } {
  const files: File[] = [];
  try {
    listTiles(root(), files);
  } catch (error) {
    logError('tileCacheUsage', error);
  }
  return { files: files.length, bytes: files.reduce((sum, f) => sum + f.size, 0) };
}

/** Removes the oldest tiles once the cache grows beyond its limit. */
export function pruneTileCache() {
  try {
    const files: File[] = [];
    listTiles(root(), files);
    let total = files.reduce((sum, f) => sum + f.size, 0);
    if (total <= MAX_CACHE_BYTES) return;
    files.sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0));
    for (const file of files) {
      if (total <= MAX_CACHE_BYTES * 0.8) break;
      total -= file.size;
      file.delete();
    }
  } catch (error) {
    logError('pruneTileCache', error);
  }
}

export function clearTileCache() {
  try {
    const dir = root();
    if (dir.exists) dir.delete();
  } catch (error) {
    logError('clearTileCache', error);
  }
}
