import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';


import { drawStamp, layoutStamp, type SkiaApi, type StampFonts } from '../src/features/stamping/stampRenderer';
import { buildStampContent, stampStyleFrom } from '../src/features/stamping/stampTemplates';
import type { CaptureLocation } from '../src/features/location/locationTypes';
import type { StampSettings } from '../src/types/settings';
import { currentLocation, sampleReading, stampSettings } from './fixtures';
import { loadHeadlessSkia } from './helpers/headlessSkia';

const OUTPUT_DIR = path.resolve(__dirname, 'output');
const PNG = 4;

let Skia: SkiaApi;
let fonts: StampFonts;
let logo: import('@shopify/react-native-skia').SkImage | null;

before(async () => {
  ({ Skia, fonts, logo } = await loadHeadlessSkia());
  mkdirSync(OUTPUT_DIR, { recursive: true });
});

function render(
  name: string,
  width: number,
  height: number,
  location: CaptureLocation,
  settings: StampSettings,
) {
  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  assert.ok(surface, 'surface');
  const canvas = surface.getCanvas();
  // Stand-in "photo": a gradient so legibility over light and dark areas is visible.
  const paint = Skia.Paint();
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: 0, y: 0 },
      { x: width, y: height },
      [Skia.Color('#88B6E8'), Skia.Color('#F2E6C9'), Skia.Color('#3D5A3A')],
      null,
      0,
    ),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);

  const content = buildStampContent(
    location,
    new Date(Date.UTC(2026, 9, 10, 8, 5, 9)),
    settings,
    'Asia/Dhaka',
  );
  const input = { content, style: stampStyleFrom(settings), mapImage: null, logoImage: logo };
  const layout = layoutStamp(Skia, fonts, input, width, height);
  drawStamp(Skia, fonts, canvas, layout, input);
  surface.flush();
  const image = surface.makeImageSnapshot();
  const bytes = image.encodeToBytes(PNG, 100);
  assert.ok(bytes && bytes.length > 1000, 'png encoded');
  writeFileSync(path.join(OUTPUT_DIR, `${name}.png`), bytes);
  return layout;
}

function assertInside(layout: ReturnType<typeof layoutStamp>) {
  const { bounds, width, height } = layout;
  assert.ok(bounds.x >= 0, `left edge ${bounds.x}`);
  assert.ok(bounds.y >= 0, `top edge ${bounds.y}`);
  assert.ok(bounds.x + bounds.width <= width + 0.5, `right edge ${bounds.x + bounds.width} > ${width}`);
  assert.ok(bounds.y + bounds.height <= height + 0.5, `bottom edge ${bounds.y + bounds.height} > ${height}`);
}

describe('stamp renderer (headless CanvasKit)', () => {
  it('renders the default stamp on a 12 MP portrait photo inside the image', () => {
    const layout = render('portrait-12mp-default', 3000, 4000, currentLocation, stampSettings({ watermark: 'Site survey · Team A' }));
    assertInside(layout);
    assert.ok(layout.map, 'map area is present');
    // Default position is bottom-left.
    assert.ok(layout.panel.x < 3000 * 0.05);
    assert.ok(layout.panel.y + layout.panel.height > 4000 * 0.9);
  });

  it('keeps the stamp inside a landscape image at every corner', () => {
    for (const position of ['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const) {
      const layout = render(`landscape-${position}`, 4000, 3000, currentLocation, stampSettings({ position, size: 0.8 }));
      assertInside(layout);
      const rightGap = 4000 - (layout.panel.x + layout.panel.width);
      if (position.endsWith('right')) assert.ok(rightGap < 4000 * 0.03, `right gap ${rightGap}`);
      else assert.ok(layout.panel.x < 4000 * 0.03, `left gap ${layout.panel.x}`);
      if (position.startsWith('top')) assert.ok(layout.panel.y < 3000 * 0.03);
      else assert.ok(3000 - (layout.panel.y + layout.panel.height) < 3000 * 0.03);
    }
  });

  it('wraps a very long address and still fits', () => {
    const longAddress = {
      ...currentLocation.address!,
      formatted:
        'Plot 1234, Road 56/A, Block C, Very Long Housing Society Name Extension, Near The Old Railway Crossing, Ward 17, Some City Corporation 1207, Bangladesh',
    };
    const layout = render(
      'long-address-large-text',
      1080,
      1920,
      { ...currentLocation, address: longAddress },
      stampSettings({ textSize: 1.4, size: 1.4, note: 'Inspection #42 — north wall, ground floor', showAltitude: true, showCompass: true }),
    );
    assertInside(layout);
  });

  it('marks cached locations and never shows coordinates when unavailable', () => {
    const cached = render(
      'cached-location',
      1200,
      1600,
      { ...currentLocation, freshness: 'cached', ageMs: 4 * 60_000, reading: { ...sampleReading, source: 'last-known' } },
      stampSettings(),
    );
    assertInside(cached);

    const content = buildStampContent(
      { freshness: 'unavailable', reading: null, ageMs: null, address: null, heading: null },
      new Date(),
      stampSettings(),
      null,
    );
    assert.equal(content.coordinates, null);
    assert.equal(content.title, null);
    assert.equal(content.status.label, 'Location unavailable');
    render('location-unavailable', 1200, 1600, { freshness: 'unavailable', reading: null, ageMs: null, address: null, heading: null }, stampSettings());
  });

  it('shrinks to fit a very wide, short frame', () => {
    const layout = render('panorama', 4000, 900, currentLocation, stampSettings({ textSize: 1.4, size: 1.4, watermark: 'GEO-CAM' }));
    assertInside(layout);
  });

  it('draws the GEO-CAM logo badge inside the image, and none when disabled', () => {
    assert.ok(logo, 'logo asset decodes');
    const withLogo = render('logo-badge', 3000, 4000, currentLocation, stampSettings({ showLogo: true }));
    assertInside(withLogo);
    assert.ok(withLogo.watermark?.logo, 'badge has a logo');
    const custom = render('logo-badge-watermark', 3000, 4000, currentLocation, stampSettings({ showLogo: true, watermark: 'Site survey · Team A', position: 'top-right' }));
    assertInside(custom);
    assert.ok(custom.watermark?.logo);
    const without = render('no-logo', 3000, 4000, currentLocation, stampSettings({ showLogo: false }));
    assert.equal(without.watermark, null);
  });

  it('renders at preview size with the same proportions as the photo', () => {
    const preview = render('preview-390x520', 390, 520, currentLocation, stampSettings());
    const photo = layoutStamp(
      Skia,
      fonts,
      {
        content: buildStampContent(currentLocation, new Date(Date.UTC(2026, 9, 10, 8, 5, 9)), stampSettings(), 'Asia/Dhaka'),
        style: stampStyleFrom(stampSettings()),
        mapImage: null,
      },
      3000,
      4000,
    );
    const previewRatio = preview.panel.height / preview.height;
    const photoRatio = photo.panel.height / photo.height;
    // Text hinting differs slightly by size; proportions must still match closely.
    assert.ok(Math.abs(previewRatio - photoRatio) < 0.02, `${previewRatio} vs ${photoRatio}`);
  });
});
