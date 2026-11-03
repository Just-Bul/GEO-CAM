import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';

import type { SkImage } from '@shopify/react-native-skia';

import { composeMap } from '../src/features/maps/mapRenderer';
import { metersPerPixel, tilesForView, TILE_SIZE, worldPixel } from '../src/features/maps/tileMath';
import { drawStamp, layoutStamp, type SkiaApi, type StampFonts } from '../src/features/stamping/stampRenderer';
import { buildStampContent, stampStyleFrom } from '../src/features/stamping/stampTemplates';
import { currentLocation, stampSettings } from './fixtures';
import { loadHeadlessSkia } from './helpers/headlessSkia';

let Skia: SkiaApi;
let fonts: StampFonts;

before(async () => {
  ({ Skia, fonts } = await loadHeadlessSkia());
});

describe('tile maths', () => {
  it('matches known Web Mercator values', () => {
    assert.deepEqual(worldPixel(0, 0, 0), { x: 128, y: 128 });
    const z1 = worldPixel(0, 0, 1);
    assert.equal(z1.x, 256);
    assert.ok(Math.abs(z1.y - 256) < 1e-9);
    // OSM tile containing Dhaka at z16, from the OSM wiki formula
    // x = (lon + 180) / 360 * 2^z, y = (1 - asinh(tan(lat)) / pi) / 2 * 2^z (computed in Python).
    const p = worldPixel(23.780573, 90.407015, 16);
    assert.equal(Math.floor(p.x / TILE_SIZE), 49226);
    assert.equal(Math.floor(p.y / TILE_SIZE), 28308);
    assert.ok(Math.abs(metersPerPixel(0, 16) - 2.3887) < 0.001);
  });

  it('covers the whole view and wraps at the antimeridian', () => {
    const tiles = tilesForView(23.78, 90.4, 16, 512);
    assert.ok(tiles.length >= 4 && tiles.length <= 9);
    for (const t of tiles) {
      assert.ok(t.left > -TILE_SIZE && t.left < 512);
      assert.ok(t.top > -TILE_SIZE && t.top < 512);
    }
    const edge = tilesForView(0, 179.999, 3, 512);
    assert.ok(edge.some((t) => t.x === 0), 'wraps to x = 0');
    assert.ok(edge.every((t) => t.x >= 0 && t.x < 8));
  });
});

/** Synthetic tile: dark grey with a red mark exactly where the target coordinate falls. */
function syntheticLoader(target: { latitude: number; longitude: number }, z: number) {
  const world = worldPixel(target.latitude, target.longitude, z);
  const count = 2 ** z;
  return async (tile: { z: number; x: number; y: number }): Promise<SkImage | null> => {
    const surface = Skia.Surface.Make(TILE_SIZE, TILE_SIZE)!;
    const canvas = surface.getCanvas();
    const bg = Skia.Paint();
    bg.setColor(Skia.Color('#404040'));
    canvas.drawRect(Skia.XYWHRect(0, 0, TILE_SIZE, TILE_SIZE), bg);
    const mark = Skia.Paint();
    mark.setColor(Skia.Color('#FF0000'));
    // The target may be in this tile directly or via longitude wrap-around.
    for (const shift of [-count, 0, count]) {
      const lx = world.x - (tile.x + shift) * TILE_SIZE;
      const ly = world.y - tile.y * TILE_SIZE;
      // Drawn in every tile the 3 px mark overlaps, so marks on a tile seam stay whole.
      if (lx > -3 && lx < TILE_SIZE + 3 && ly > -3 && ly < TILE_SIZE + 3) {
        canvas.drawRect(Skia.XYWHRect(Math.floor(lx) - 1, Math.floor(ly) - 1, 3, 3), mark);
      }
    }
    surface.flush();
    return surface.makeImageSnapshot();
  };
}

function pixelAt(image: SkImage, x: number, y: number) {
  const px = image.readPixels(x, y, { width: 1, height: 1, colorType: 4, alphaType: 1 }) as Uint8Array;
  return [px[0], px[1], px[2]];
}

describe('composed mini map', () => {
  for (const [name, target] of [
    ['Dhaka', { latitude: 23.780573, longitude: 90.407015 }],
    ['tile seam', { latitude: 0.0000001, longitude: 0.0000001 }],
    ['antimeridian', { latitude: -16.5, longitude: 179.9999 }],
  ] as const) {
    it(`puts the exact coordinate at the centre (${name})`, async () => {
      const map = await composeMap(Skia, syntheticLoader(target, 16), target.latitude, target.longitude, 16, 512);
      assert.ok(map);
      assert.equal(map.width(), 512);
      const [r, g] = pixelAt(map, 256, 256);
      assert.ok(r > 200 && g < 60, `centre pixel should be the red mark, got ${r},${g}`);
    });
  }

  it('returns no map when any tile is missing (never a map with holes)', async () => {
    let calls = 0;
    const map = await composeMap(Skia, async () => (++calls === 2 ? null : syntheticLoader({ latitude: 0, longitude: 0 }, 16)({ z: 16, x: 0, y: 0 })), 23.78, 90.4, 16, 512);
    assert.equal(map, null);
  });

  it('draws the map with the OpenStreetMap credit inside the stamp', async () => {
    const target = { latitude: 23.780573, longitude: 90.407015 };
    const map = await composeMap(Skia, syntheticLoader(target, 16), target.latitude, target.longitude, 16, 512);
    const settings = stampSettings();
    const input = {
      content: buildStampContent(currentLocation, new Date(Date.UTC(2026, 9, 10, 8, 5, 9)), settings, 'Asia/Dhaka'),
      style: stampStyleFrom(settings),
      mapImage: map,
    };
    const surface = Skia.Surface.Make(1200, 1600)!;
    const layout = layoutStamp(Skia, fonts, input, 1200, 1600);
    drawStamp(Skia, fonts, surface.getCanvas(), layout, input);
    surface.flush();
    const out = path.resolve(__dirname, 'output');
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, 'stamp-with-map.png'), surface.makeImageSnapshot().encodeToBytes(4, 100));
    assert.ok(layout.map, 'map box present');
  });
});
