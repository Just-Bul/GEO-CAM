import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';

import type { AppSettings } from '../../types/settings';
import { logError } from '../../utils/errors';
import { distanceMeters } from '../location/locationFreshness';
import { composeMap, MINI_MAP_SIZE, MINI_MAP_ZOOM } from './mapRenderer';
import { getTile, pruneTileCache } from './tileCache';
import type { TileRef } from './tileMath';

/** Online map tiles are allowed only when the user turned them on and strict offline mode is off. */
export function mapNetworkAllowed(settings: AppSettings): boolean {
  return settings.privacy.allowOnlineMaps && !settings.privacy.offlineMode;
}

/** Small in-memory cache of decoded tiles so the live preview can re-centre cheaply. */
const decoded = new Map<string, SkImage>();
const MAX_DECODED = 36;

async function loadTileImage(tile: TileRef, allowNetwork: boolean): Promise<SkImage | null> {
  const key = `${tile.z}/${tile.x}/${tile.y}`;
  const hit = decoded.get(key);
  if (hit) {
    decoded.delete(key);
    decoded.set(key, hit);
    return hit;
  }
  const file = await getTile(tile, allowNetwork);
  // Skia's file read never settles for a missing file, so check first.
  if (!file || !file.exists) return null;
  try {
    const data = await Skia.Data.fromURI(file.uri);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) return null;
    decoded.set(key, image);
    while (decoded.size > MAX_DECODED) {
      const oldest = decoded.keys().next().value as string;
      decoded.get(oldest)?.dispose();
      decoded.delete(oldest);
    }
    return image;
  } catch (error) {
    logError('decode tile', error);
    return null;
  }
}

/**
 * Map image centred exactly on the coordinate, or null when the needed tiles are
 * neither cached nor downloadable (offline, online maps off, server unreachable).
 */
export async function getMiniMap(
  latitude: number,
  longitude: number,
  allowNetwork: boolean,
  timeoutMs = 6000,
): Promise<SkImage | null> {
  const work = composeMap(Skia, (tile) => loadTileImage(tile, allowNetwork), latitude, longitude, MINI_MAP_ZOOM, MINI_MAP_SIZE);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    return await Promise.race([work, timeout]);
  } catch (error) {
    logError('getMiniMap', error);
    return null;
  }
}

let pruned = false;
/** The live preview may wait longer than a capture for tiles to arrive. */
const PREVIEW_TIMEOUT_MS = 20_000;
const RETRY_MS = 4000;

export type MiniMapStatus = 'off' | 'loading' | 'ready' | 'unavailable';

/**
 * Live mini map for the camera preview. Re-centres when the reading moves more
 * than a few meters; keeps showing nothing (the "Map unavailable" card) rather
 * than a map of somewhere else.
 */
export function useMiniMap(
  coords: { latitude: number; longitude: number } | null,
  enabled: boolean,
  allowNetwork: boolean,
): { image: SkImage | null; status: MiniMapStatus } {
  // Result of the latest finished request, tagged with the position it was built for.
  const [result, setResult] = useState<{
    image: SkImage | null;
    for: { latitude: number; longitude: number };
  } | null>(null);
  const request = useRef(0);
  // Bumped to retry when a map could not be built yet (tiles still downloading,
  // network back after being offline). Tiles fetched by earlier attempts are reused.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!pruned) {
      pruned = true;
      pruneTileCache();
    }
  }, []);

  useEffect(() => {
    if (!enabled || !coords) return;
    if (result?.image && distanceMeters(result.for, coords) < 3) return;
    const id = ++request.current;
    const target = coords;
    let retry: ReturnType<typeof setTimeout> | null = null;
    getMiniMap(target.latitude, target.longitude, allowNetwork, PREVIEW_TIMEOUT_MS).then((image) => {
      if (id !== request.current) return;
      setResult({ image, for: target });
      if (!image) retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    });
    return () => {
      if (retry) clearTimeout(retry);
    };
    // Only position / policy changes (and retries) should trigger a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.latitude, coords?.longitude, enabled, allowNetwork, attempt]);

  if (!enabled) return { image: null, status: 'off' };
  if (!coords) return { image: null, status: 'unavailable' };
  // Never show a map built for a different place than the current reading.
  const near = result != null && distanceMeters(result.for, coords) < 15;
  if (!near) return { image: null, status: 'loading' };
  return result.image ? { image: result.image, status: 'ready' } : { image: null, status: 'unavailable' };
}
