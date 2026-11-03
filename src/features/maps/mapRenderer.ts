import type { SkImage } from '@shopify/react-native-skia';

import type { SkiaApi } from '../stamping/stampRenderer';
import { tilesForView, type TileRef } from './tileMath';

/** Zoom used for the stamp's mini map: street level, ~550 m across at 512 px. */
export const MINI_MAP_ZOOM = 17;
/** Square size of the composed map image; the stamp scales it into its map box. */
export const MINI_MAP_SIZE = 512;

export type TileLoader = (tile: TileRef) => Promise<SkImage | null>;

/**
 * Stitches map tiles into one square image whose centre is exactly
 * (latitude, longitude), so the stamp's marker at the centre marks the real spot.
 * Returns null unless every tile is available: a map with holes would be misleading.
 */
export async function composeMap(
  Skia: SkiaApi,
  loadTile: TileLoader,
  latitude: number,
  longitude: number,
  zoom = MINI_MAP_ZOOM,
  size = MINI_MAP_SIZE,
): Promise<SkImage | null> {
  const placed = tilesForView(latitude, longitude, zoom, size);
  if (!placed.length) return null;
  const images = await Promise.all(placed.map((tile) => loadTile(tile)));
  if (images.some((image) => image == null)) return null;

  const surface = Skia.Surface.MakeOffscreen(size, size) ?? Skia.Surface.Make(size, size);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  placed.forEach((tile, index) => {
    const image = images[index]!;
    canvas.drawImageRect(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(tile.left, tile.top, 256, 256),
      paint,
    );
  });
  surface.flush();
  // A raster copy, so the map can be reused on any thread/surface (preview, photo, video).
  const snapshot = surface.makeImageSnapshot();
  const raster = snapshot.makeNonTextureImage();
  surface.dispose();
  if (raster) {
    snapshot.dispose();
    return raster;
  }
  return snapshot;
}
