/** Web Mercator ("slippy map") maths used by OpenStreetMap tiles. */

export const TILE_SIZE = 256;
/** Latitude limit of Web Mercator. */
const MAX_LAT = 85.05112878;

export interface TileRef {
  z: number;
  x: number;
  y: number;
}

export interface PlacedTile extends TileRef {
  /** Top-left position of the tile inside the output image, in pixels. */
  left: number;
  top: number;
}

/** Position of a coordinate in global pixel space at zoom `z`. */
export function worldPixel(latitude: number, longitude: number, z: number): { x: number; y: number } {
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, latitude));
  const scale = TILE_SIZE * 2 ** z;
  const x = ((longitude + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/**
 * Tiles needed for a `size` x `size` image whose centre is exactly the given
 * coordinate, with each tile's offset inside that image. Tile x wraps around the
 * antimeridian; tiles beyond the poles are skipped.
 */
export function tilesForView(latitude: number, longitude: number, z: number, size: number): PlacedTile[] {
  const centre = worldPixel(latitude, longitude, z);
  const left = centre.x - size / 2;
  const top = centre.y - size / 2;
  const count = 2 ** z;
  const tiles: PlacedTile[] = [];
  const firstX = Math.floor(left / TILE_SIZE);
  const lastX = Math.floor((left + size - 1) / TILE_SIZE);
  const firstY = Math.floor(top / TILE_SIZE);
  const lastY = Math.floor((top + size - 1) / TILE_SIZE);
  for (let ty = firstY; ty <= lastY; ty += 1) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = firstX; tx <= lastX; tx += 1) {
      tiles.push({
        z,
        x: ((tx % count) + count) % count,
        y: ty,
        left: tx * TILE_SIZE - left,
        top: ty * TILE_SIZE - top,
      });
    }
  }
  return tiles;
}

/** Ground distance covered by one pixel at this latitude and zoom, in meters. */
export function metersPerPixel(latitude: number, z: number): number {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** z;
}
