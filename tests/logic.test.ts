import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addressLine, addressTitle } from '../src/features/location/addressFormat';
import { classifyReading, distanceMeters } from '../src/features/location/locationFreshness';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/features/settings/settingsDefaults';
import { buildStampContent } from '../src/features/stamping/stampTemplates';
import {
  captureFileName,
  countryFlag,
  formatAccuracy,
  formatAge,
  formatHeading,
  formatLatitude,
  formatLongitude,
  formatStampTime,
} from '../src/utils/format';
import { currentLocation, sampleAddress, sampleReading, stampSettings } from './fixtures';

describe('format', () => {
  it('formats decimal and DMS coordinates', () => {
    assert.equal(formatLatitude(23.780573, 'decimal'), '23.780573°');
    assert.equal(formatLongitude(-0.1276, 'decimal'), '-0.127600°');
    assert.equal(formatLatitude(23.780573, 'dms'), `23°46'50.1"N`);
    assert.equal(formatLongitude(-0.1276, 'dms'), `0°07'39.4"W`);
    // Rounding must carry into minutes instead of printing 60.0 seconds.
    assert.equal(formatLatitude(10.9999999, 'dms'), `11°00'00.0"N`);
  });

  it('never reports accuracy better than the OS value', () => {
    assert.equal(formatAccuracy(7.01), '±8 m');
    assert.equal(formatAccuracy(0.2), '±1 m');
    assert.equal(formatAccuracy(1499), '±1.5 km');
    assert.equal(formatAccuracy(null), null);
    assert.equal(formatAccuracy(-1), null);
  });

  it('formats ages, headings, flags and times', () => {
    assert.equal(formatAge(42_000), '42 s');
    assert.equal(formatAge(4 * 60_000), '4 min');
    assert.equal(formatHeading(359), '359° N');
    assert.equal(formatHeading(-1), null);
    assert.equal(countryFlag('bd'), '🇧🇩');
    assert.equal(countryFlag('B1'), null);
    const date = new Date(2026, 9, 10, 0, 5, 9);
    assert.equal(formatStampTime(date, false), '12:05:09 AM');
    assert.equal(formatStampTime(date, true), '00:05:09');
  });

  it('builds capture file names from local time', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5);
    assert.equal(captureFileName(date, 'jpg'), 'GEO_20260102_030405.jpg');
    assert.equal(captureFileName(date, 'mp4', '_original'), 'GEO_20260102_030405_original.mp4');
  });
});

describe('location freshness', () => {
  const settings = DEFAULT_SETTINGS.location;
  const now = sampleReading.timestamp;

  it('classifies live, cached and stale readings', () => {
    assert.equal(classifyReading(sampleReading, now + 5000, settings).freshness, 'current');
    assert.equal(classifyReading(sampleReading, now + 31_000, settings).freshness, 'cached');
    assert.equal(
      classifyReading({ ...sampleReading, source: 'last-known' }, now + 1000, settings).freshness,
      'cached',
      'OS-cached readings are never "current", however new',
    );
    assert.equal(classifyReading(sampleReading, now + 31 * 60_000, settings).freshness, 'unavailable');
    assert.equal(
      classifyReading(sampleReading, now + 60_000, { ...settings, allowCachedLocation: false }).freshness,
      'unavailable',
    );
    assert.equal(classifyReading(null, now, settings).freshness, 'unavailable');
    assert.equal(classifyReading(sampleReading, now - 2000, settings).ageMs, 0);
  });

  it('computes distances', () => {
    const d = distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    assert.ok(Math.abs(d - 111_195) < 50, String(d));
  });
});

describe('settings', () => {
  it('fills defaults and rejects invalid values', () => {
    const settings = sanitizeSettings({
      stamp: { size: 9, textColor: 'red', position: 'middle', backgroundOpacity: -2, showMap: 'yes' },
      camera: { flash: 'strobe', lastZoom: 4 },
      storage: { photoQuality: 0.1 },
      unknown: true,
    });
    assert.equal(settings.stamp.size, 1.4);
    assert.equal(settings.stamp.textColor, '#FFFFFF');
    assert.equal(settings.stamp.position, 'bottom-left');
    assert.equal(settings.stamp.backgroundOpacity, 0);
    assert.equal(settings.stamp.showMap, true);
    assert.equal(settings.camera.flash, 'off');
    assert.equal(settings.camera.lastZoom, 1);
    assert.equal(settings.storage.photoQuality, 0.5);
    assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(sanitizeSettings('garbage'), DEFAULT_SETTINGS);
  });
});

describe('address formatting', () => {
  it('builds a title and a full line without duplicates', () => {
    assert.equal(addressTitle(sampleAddress), 'Dhaka, Dhaka Division, Bangladesh');
    assert.equal(addressLine(sampleAddress), sampleAddress.formatted);
    const noFormatted = { ...sampleAddress, formatted: null };
    assert.equal(
      addressLine(noFormatted),
      '54 Gulshan Avenue, Gulshan, Dhaka 1212, Dhaka Division, Bangladesh',
    );
  });
});

describe('stamp content', () => {
  const at = new Date(Date.UTC(2026, 9, 10, 8, 5, 9));

  it('shows coordinates instead of an address when the address is missing', () => {
    const content = buildStampContent({ ...currentLocation, address: null }, at, stampSettings({ showCoordinates: false }), null);
    assert.equal(content.title, null);
    assert.ok(content.coordinates?.startsWith('Lat 23.780573°'));
  });

  it('respects a user who hides all location text', () => {
    const content = buildStampContent(
      currentLocation,
      at,
      stampSettings({ showCoordinates: false, showAddress: false, showLocationName: false }),
      null,
    );
    assert.equal(content.coordinates, null);
    assert.equal(content.address, null);
  });

  it('labels mocked and cached readings', () => {
    const mocked = buildStampContent(
      { ...currentLocation, reading: { ...sampleReading, mocked: true } },
      at,
      stampSettings(),
      null,
    );
    assert.equal(mocked.status.kind, 'mocked');
    const cached = buildStampContent({ ...currentLocation, freshness: 'cached', ageMs: 125_000 }, at, stampSettings(), null);
    assert.equal(cached.status.label, 'Cached location · 2 min old');
  });
});
