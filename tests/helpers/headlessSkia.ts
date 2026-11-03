/**
 * Loads Skia's CanvasKit (WebAssembly) build so the app's real stamp renderer
 * can be exercised in Node without a device.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { SkImage } from '@shopify/react-native-skia';

import { createStampFonts, type SkiaApi, type StampFonts } from '../../src/features/stamping/stampRenderer';

const require = createRequire(import.meta.url);

let cached: { Skia: SkiaApi; fonts: StampFonts; logo: SkImage | null } | null = null;

/** Throws on keys whose value is `undefined`, anywhere in a style object. */
function assertNoUndefined(value: unknown, path: string) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) throw new Error(`Style key "${path}${key}" is undefined`);
    assertNoUndefined(child, `${path}${key}.`);
  }
}

/**
 * Native Skia (JSI) treats a key that exists with an `undefined` value as set and
 * then fails ("Value is undefined, expected an Object"); CanvasKit silently accepts it.
 * Make the headless build behave like the device so such bugs fail here first.
 */
function strictParagraphStyles(Skia: SkiaApi) {
  const factory = Skia.ParagraphBuilder;
  const make = factory.Make.bind(factory);
  factory.Make = (style, provider) => {
    assertNoUndefined(style, '');
    const builder = make(style, provider);
    const pushStyle = builder.pushStyle.bind(builder);
    builder.pushStyle = (textStyle, ...rest) => {
      assertNoUndefined(textStyle, 'pushStyle.');
      return pushStyle(textStyle, ...rest);
    };
    return builder;
  };
}

export async function loadHeadlessSkia() {
  if (cached) return cached;
  const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');
  const wasmDir = path.dirname(require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm'));
  const CanvasKit = await CanvasKitInit({ locateFile: (file: string) => path.join(wasmDir, file) });
  (globalThis as Record<string, unknown>).CanvasKit = CanvasKit;
  const { getSkiaExports } = require('@shopify/react-native-skia/lib/commonjs/headless');
  const { Skia } = getSkiaExports() as { Skia: SkiaApi };
  strictParagraphStyles(Skia);
  const fontsDir = path.resolve(__dirname, '../../assets/fonts');
  const fonts = createStampFonts(Skia, {
    regular: new Uint8Array(readFileSync(path.join(fontsDir, 'Inter-Regular.ttf'))),
    semibold: new Uint8Array(readFileSync(path.join(fontsDir, 'Inter-SemiBold.ttf'))),
  });
  const logoBytes = new Uint8Array(readFileSync(path.resolve(__dirname, '../../assets/images/logo-emblem.png')));
  const logo = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(logoBytes));
  cached = { Skia, fonts, logo };
  return cached;
}
