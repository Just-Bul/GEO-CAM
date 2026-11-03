import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { distanceMeters } from '../src/features/location/locationFreshness';
import type { LocationReading } from '../src/features/location/locationTypes';
import { createPositionFilter } from '../src/features/location/positionFilter';
import { sampleReading } from './fixtures';

/** Meters → degrees of latitude (close enough for test offsets). */
const M = 1 / 111_320;

function fix(t: number, dNorthM: number, dEastM: number, extra: Partial<LocationReading> = {}): LocationReading {
  return {
    ...sampleReading,
    latitude: sampleReading.latitude + dNorthM * M,
    longitude: sampleReading.longitude + (dEastM * M) / Math.cos((sampleReading.latitude * Math.PI) / 180),
    accuracy: 5,
    timestamp: 1_000_000 + t * 1000,
    ...extra,
  };
}

describe('position filter', () => {
  it('keeps a still phone steady despite GPS jitter', () => {
    const filter = createPositionFilter();
    // Deterministic ±4 m jitter around the true point.
    const jitter = [4, -3, 2, -4, 3, -2, 4, -4, 1, -3, 3, -1, 4, -4, 2, -2, 3, -3, 1, -1];
    let rawSpread = 0;
    let filteredSpread = 0;
    let previous: LocationReading | null = null;
    jitter.forEach((offset, i) => {
      const raw = fix(i, offset, -offset);
      const out = filter.update(raw)!;
      assert.ok(out, 'fix accepted');
      if (i >= 10 && previous) {
        rawSpread = Math.max(rawSpread, distanceMeters(fix(i - 1, jitter[i - 1], -jitter[i - 1]), raw));
        filteredSpread = Math.max(filteredSpread, distanceMeters(previous, out));
      }
      previous = out;
    });
    assert.ok(filteredSpread < rawSpread / 3, `filtered ${filteredSpread} vs raw ${rawSpread}`);
    assert.ok(distanceMeters(previous!, fix(0, 0, 0)) < 2, 'stays near the true point');
  });

  it('rejects a coarse network fix while a good GPS fix exists', () => {
    const filter = createPositionFilter();
    filter.update(fix(0, 0, 0));
    filter.update(fix(1, 0, 0));
    assert.equal(filter.update(fix(2, 300, 0, { accuracy: 120 })), null);
  });

  it('rejects an impossible jump but recovers if it persists', () => {
    const filter = createPositionFilter();
    filter.update(fix(0, 0, 0));
    assert.equal(filter.update(fix(1, 500, 0)), null);
    const recovered = filter.update(fix(10, 500, 0))!;
    assert.ok(distanceMeters(recovered, fix(0, 500, 0)) < 1);
  });

  it('follows the device when it moves', () => {
    const filter = createPositionFilter();
    let out: LocationReading | null = null;
    for (let t = 0; t <= 20; t += 1) out = filter.update(fix(t, t * 1.4, 0, { speed: 1.4 }));
    assert.ok(distanceMeters(out!, fix(20, 28, 0)) < 4, 'lags at most a few meters while walking');
  });

  it('never reports better accuracy than the OS did', () => {
    const filter = createPositionFilter();
    filter.update(fix(0, 0, 0, { accuracy: 8 }));
    assert.equal(filter.update(fix(1, 1, 0, { accuracy: 8 }))!.accuracy, 8);
  });
});
