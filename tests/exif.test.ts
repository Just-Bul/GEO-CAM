import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildExifSegment, insertExif } from '../src/features/media/exifWriter';
import { loadHeadlessSkia } from './helpers/headlessSkia';

const OUTPUT_DIR = path.resolve(__dirname, 'output');
const JPEG = 3;

describe('EXIF writer', () => {
  it('inserts a well-formed APP1 segment into a Skia-encoded JPEG', async () => {
    const { Skia } = await loadHeadlessSkia();
    const surface = Skia.Surface.MakeOffscreen(640, 480) ?? Skia.Surface.Make(640, 480);
    assert.ok(surface);
    const paint = Skia.Paint();
    paint.setColor(Skia.Color('#3366CC'));
    surface.getCanvas().drawRect(Skia.XYWHRect(0, 0, 640, 480), paint);
    surface.flush();
    const jpeg = surface.makeImageSnapshot().encodeToBytes(JPEG, 90);

    const segment = buildExifSegment({
      capturedAt: new Date(2026, 9, 10, 14, 5, 9),
      utcOffset: '+06:00',
      width: 640,
      height: 480,
      software: 'Geo Camera 1.0.0',
      gps: {
        latitude: 23.780573,
        longitude: -90.407015,
        altitude: -12.34,
        accuracy: 7.01,
        timestamp: Date.UTC(2026, 9, 10, 8, 5, 9),
        heading: 212.5,
      },
    });
    assert.equal(segment[0], 0xff);
    assert.equal(segment[1], 0xe1);
    assert.equal((segment[2] << 8) | segment[3], segment.length - 2);

    const output = insertExif(jpeg, segment);
    assert.equal(output[0], 0xff);
    assert.equal(output[1], 0xd8);
    assert.equal(output.length, jpeg.length + segment.length);
    // The image must still decode after insertion.
    const decoded = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(output));
    assert.ok(decoded);
    assert.equal(decoded.width(), 640);

    // Re-inserting replaces rather than duplicates.
    const twice = insertExif(output, segment);
    assert.equal(twice.length, output.length);

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(path.join(OUTPUT_DIR, 'exif-sample.jpg'), output);

    const noGps = buildExifSegment({
      capturedAt: new Date(2026, 9, 10, 14, 5, 9),
      utcOffset: '+06:00',
      width: 640,
      height: 480,
      software: 'Geo Camera 1.0.0',
      gps: null,
    });
    writeFileSync(path.join(OUTPUT_DIR, 'exif-no-gps.jpg'), insertExif(jpeg, noGps));
  });

  it('rejects non-JPEG input', () => {
    assert.throws(() => insertExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), new Uint8Array()));
  });
});
