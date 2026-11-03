import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolvePictureSize, usablePictureSizes } from '../src/features/camera/cameraService';
import { DEFAULT_SETTINGS } from '../src/features/settings/settingsDefaults';
import { locationAt, type LocationSample } from '../src/features/stamping/dynamicLocation';
import { currentLocation, sampleReading } from './fixtures';

describe('picture sizes', () => {
  // List reported by the Android emulator's CameraX (October 2026).
  const emulator = ['1920x1440', '1920x1080', '1920x960', '1600x1200', '1440x1080', '1280x960', '1280x720', '640x480'];

  it('keeps only 4:3 sizes, largest first', () => {
    assert.deepEqual(usablePictureSizes(emulator), ['1920x1440', '1600x1200', '1440x1080', '1280x960', '640x480']);
  });

  it('skips sizes too large to stamp in memory', () => {
    assert.deepEqual(usablePictureSizes(['12000x9000', '8000x6000', '4000x3000']), ['8000x6000', '4000x3000']);
  });

  it('uses the iOS full-resolution photo preset', () => {
    assert.deepEqual(usablePictureSizes(['3840x2160', 'Photo', 'High']), ['Photo']);
  });

  it('resolves "max" and unknown sizes to the largest, keeps a valid choice', () => {
    const sizes = usablePictureSizes(emulator);
    assert.equal(resolvePictureSize('max', sizes), '1920x1440');
    assert.equal(resolvePictureSize('1280x960', sizes), '1280x960');
    assert.equal(resolvePictureSize('9999x1', sizes), '1920x1440');
    assert.equal(resolvePictureSize('max', []), undefined);
  });
});

describe('dynamic video stamp locations', () => {
  const start = currentLocation;
  const t0 = sampleReading.timestamp;
  const sample = (dtMs: number, dLat: number): LocationSample => ({
    reading: { ...sampleReading, timestamp: t0 + dtMs, latitude: sampleReading.latitude + dLat },
    heading: null,
  });
  const samples = [sample(1000, 0), sample(2000, 0.0001), sample(5000, 0.002)];

  it('uses the newest reading that existed at that moment, never a future one', () => {
    assert.equal(locationAt(t0 + 1500, start, samples, DEFAULT_SETTINGS).reading?.timestamp, t0 + 1000);
    assert.equal(locationAt(t0 + 4999, start, samples, DEFAULT_SETTINGS).reading?.timestamp, t0 + 2000);
    assert.equal(locationAt(t0 + 6000, start, samples, DEFAULT_SETTINGS).reading?.timestamp, t0 + 5000);
  });

  it('falls back to the start location before the first reading', () => {
    assert.equal(locationAt(t0 + 500, start, samples, DEFAULT_SETTINGS), start);
  });

  it('keeps the start address only while still nearby', () => {
    assert.ok(locationAt(t0 + 2500, start, samples, DEFAULT_SETTINGS).address);
    // 0.002° latitude ≈ 220 m away from where the address was resolved.
    assert.equal(locationAt(t0 + 5500, start, samples, DEFAULT_SETTINGS).address, null);
  });

  it('labels an old reading as cached with its real age instead of interpolating', () => {
    const at = t0 + 5000 + 40_000;
    const result = locationAt(at, start, samples, DEFAULT_SETTINGS);
    assert.equal(result.freshness, 'cached');
    assert.equal(result.ageMs, 40_000);
    assert.equal(result.reading?.latitude, samples[2].reading.latitude);
  });
});
