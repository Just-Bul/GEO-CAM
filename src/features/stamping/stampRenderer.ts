/**
 * Draws the location stamp with Skia.
 *
 * This module deliberately has no runtime imports from `@shopify/react-native-skia`:
 * the Skia API object is passed in. The same code therefore draws the live preview,
 * the saved photo and the video overlay frames in the app, and also runs headless
 * in Node (CanvasKit) for automated rendering tests.
 */
import type {
  Skia as SkiaValue,
  SkCanvas,
  SkImage,
  SkParagraph,
  SkRect,
  SkTypefaceFontProvider,
} from '@shopify/react-native-skia';

import type { StampContent, StampStyle } from './stampTemplates';

/** The Skia API object (`Skia` in the app, CanvasKit-backed in tests). */
export type SkiaApi = typeof SkiaValue;

// Numeric values of Skia enums (kept local so this file has no runtime Skia import).
const CLIP_INTERSECT = 1;
const PAINT_STROKE = 1;
const FONT_WEIGHT_NORMAL = 400;
const FONT_WEIGHT_SEMIBOLD = 600;

export const STAMP_FONT_FAMILY = 'Inter';

export interface StampFonts {
  provider: SkTypefaceFontProvider;
  family: string;
}

export interface StampRenderInput {
  content: StampContent;
  style: StampStyle;
  /** Real map image for these coordinates, or null to draw the "map unavailable" card. */
  mapImage: SkImage | null;
  /** GEO-CAM emblem drawn in the badge when `style.showLogo` is on. */
  logoImage?: SkImage | null;
}

interface TextBlock {
  paragraph: SkParagraph;
  x: number;
  y: number;
}

export interface StampLayout {
  width: number;
  height: number;
  /** Union of everything the stamp draws; used to crop video overlay bitmaps. */
  bounds: SkRect;
  panel: SkRect;
  radius: number;
  map: SkRect | null;
  mapRadius: number;
  watermark: { rect: SkRect; text: TextBlock; logo: SkRect | null } | null;
  blocks: TextBlock[];
  unit: number;
}

const COLOR_WARNING = '#FFB020';
const COLOR_UNAVAILABLE = '#FF8A80';
const COLOR_PIN = '#0098FD'; // GEO-CAM brand blue
const COLOR_BRAND_SKY = '#1AA3FF';
const COLOR_BRAND_SILVER = '#D1D7E1';

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  // Skia accepts #RRGGBBAA.
  return `${hex.slice(0, 7)}${a}`;
}

function makeParagraph(
  Skia: SkiaApi,
  fonts: StampFonts,
  text: string,
  options: {
    size: number;
    color: string;
    weight?: number;
    maxLines?: number;
    width: number;
    shadow: number;
    /** Optional differently coloured runs; their texts replace `text`. */
    runs?: { text: string; color: string }[];
  },
): SkParagraph {
  // Optional keys are only added when set: native Skia treats a key that is present
  // with an `undefined` value as set, and then fails to read it.
  const textStyle: Record<string, unknown> = {
    color: Skia.Color(options.color),
    fontFamilies: [fonts.family],
    fontSize: options.size,
    fontStyle: { weight: options.weight ?? FONT_WEIGHT_NORMAL },
    heightMultiplier: 1.18,
  };
  if (options.shadow > 0) {
    textStyle.shadows = [
      {
        color: Skia.Color('rgba(0,0,0,0.75)'),
        blurRadius: options.shadow,
        offset: { x: 0, y: options.shadow * 0.4 },
      },
    ];
  }
  const paragraphStyle: Record<string, unknown> = { textStyle };
  if (options.maxLines) {
    paragraphStyle.maxLines = options.maxLines;
    paragraphStyle.ellipsis = '…';
  }
  const builder = Skia.ParagraphBuilder.Make(
    paragraphStyle as Parameters<SkiaApi['ParagraphBuilder']['Make']>[0],
    fonts.provider,
  );
  const runs = options.runs ?? [{ text, color: options.color }];
  for (const run of runs) {
    builder.pushStyle({ ...textStyle, color: Skia.Color(run.color) } as Parameters<typeof builder.pushStyle>[0]);
    builder.addText(run.text);
    builder.pop();
  }
  const paragraph = builder.build();
  paragraph.layout(options.width);
  return paragraph;
}

function layoutWithUnit(
  Skia: SkiaApi,
  fonts: StampFonts,
  input: StampRenderInput,
  width: number,
  height: number,
  unit: number,
): StampLayout {
  const { content, style } = input;
  const u = unit;
  const margin = 2.4 * u;
  const pad = 2.0 * u;
  const gap = 1.8 * u;
  const lineGap = 0.55 * u;
  const radius = 2.0 * u;
  const textScale = style.textSize;
  const shadow = style.backgroundOpacity < 0.35 ? 0.35 * u : 0;

  const shortSide = Math.min(width, height);
  const panelWidth = Math.min(width - 2 * margin, shortSide * 0.94 * style.size);

  let mapSide = style.showMap ? Math.max(12 * u, 19 * u * Math.min(style.size, 1.15)) : 0;
  let textWidth = panelWidth - 2 * pad - (mapSide ? mapSide + gap : 0);
  if (mapSide && textWidth < 28 * u) {
    // Too narrow for a map and readable text side by side: keep the text.
    mapSide = 0;
    textWidth = panelWidth - 2 * pad;
  }

  const titleSize = 3.3 * u * textScale;
  const bodySize = 2.45 * u * textScale;
  const smallSize = 2.1 * u * textScale;
  const textColor = style.textColor;
  const secondary = withAlpha(textColor, 0.86);

  const paragraphs: SkParagraph[] = [];
  const add = (text: string | null, size: number, color: string, weight?: number, maxLines?: number) => {
    if (!text) return;
    paragraphs.push(
      makeParagraph(Skia, fonts, text, { size, color, weight, maxLines, width: textWidth, shadow }),
    );
  };

  const title = content.title ? (content.flag ? `${content.flag} ${content.title}` : content.title) : null;
  add(title, titleSize, textColor, FONT_WEIGHT_SEMIBOLD, 2);
  add(content.address, bodySize, secondary, FONT_WEIGHT_NORMAL, 3);
  add(content.coordinates, bodySize, textColor);
  add(content.dateTime, bodySize, secondary, FONT_WEIGHT_NORMAL, 2);
  if (content.details.length) add(content.details.join('  ·  '), smallSize, secondary, FONT_WEIGHT_NORMAL, 2);
  if (content.status.label) {
    const color = content.status.kind === 'unavailable' ? COLOR_UNAVAILABLE : COLOR_WARNING;
    add(content.status.label, smallSize, color, FONT_WEIGHT_SEMIBOLD, 1);
  }
  add(content.note, smallSize, secondary, FONT_WEIGHT_NORMAL, 2);

  const textHeight = paragraphs.reduce(
    (sum, p, index) => sum + p.getHeight() + (index > 0 ? lineGap : 0),
    0,
  );
  const innerHeight = Math.max(textHeight, mapSide);
  const panelHeight = innerHeight + 2 * pad;

  // Badge above (or below) the panel: optional GEO-CAM emblem + watermark text.
  // With the logo on and no custom watermark, the badge reads "GEO-CAM".
  const logo = style.showLogo ? input.logoImage : null;
  const badgeText = content.watermark ?? (logo ? 'GEO-CAM' : null);
  let watermarkParagraph: SkParagraph | null = null;
  let watermarkWidth = 0;
  let watermarkHeight = 0;
  let logoWidth = 0;
  let logoHeight = 0;
  const badgePadX = 1.2 * u;
  const badgeGap = 0.6 * u;
  const watermarkGap = 0.8 * u;
  if (badgeText) {
    watermarkParagraph = makeParagraph(Skia, fonts, badgeText, {
      size: smallSize,
      color: textColor,
      weight: FONT_WEIGHT_SEMIBOLD,
      maxLines: 1,
      width: panelWidth - 2 * badgePadX - (logo ? 6 * u : 0),
      shadow,
      // The app name is drawn in the logo's colours: blue "GEO", silver "-CAM".
      runs: content.watermark
        ? undefined
        : [
            { text: 'GEO', color: COLOR_BRAND_SKY },
            { text: '-CAM', color: COLOR_BRAND_SILVER },
          ],
    });
    const textHeightBadge = watermarkParagraph.getHeight();
    if (logo) {
      logoHeight = textHeightBadge * 1.55;
      logoWidth = (logoHeight * logo.width()) / logo.height();
    }
    watermarkWidth = Math.min(
      panelWidth,
      Math.ceil(watermarkParagraph.getLongestLine()) + 2 * badgePadX + (logo ? logoWidth + badgeGap : 0),
    );
    watermarkHeight = Math.max(textHeightBadge, logoHeight) + 1.0 * u;
  }

  const isLeft = style.position.endsWith('left');
  const isBottom = style.position.startsWith('bottom');
  const panelX = isLeft ? margin : width - margin - panelWidth;
  const stackHeight = panelHeight + (watermarkParagraph ? watermarkHeight + watermarkGap : 0);
  const stackTop = isBottom ? height - margin - stackHeight : margin;
  // Watermark sits on the outer side of the panel: above it at the bottom, below it at the top.
  const panelY = isBottom && watermarkParagraph ? stackTop + watermarkHeight + watermarkGap : stackTop;

  const panel = Skia.XYWHRect(panelX, panelY, panelWidth, panelHeight);
  const mapRect = mapSide
    ? Skia.XYWHRect(panelX + pad, panelY + pad + (innerHeight - mapSide) / 2, mapSide, mapSide)
    : null;

  const textX = panelX + pad + (mapSide ? mapSide + gap : 0);
  let cursorY = panelY + pad + (innerHeight - textHeight) / 2;
  const blocks: TextBlock[] = paragraphs.map((paragraph, index) => {
    if (index > 0) cursorY += lineGap;
    const block = { paragraph, x: textX, y: cursorY };
    cursorY += paragraph.getHeight();
    return block;
  });

  let watermark: StampLayout['watermark'] = null;
  if (watermarkParagraph) {
    const wx = isLeft ? panelX : panelX + panelWidth - watermarkWidth;
    const wy = isBottom ? stackTop : panelY + panelHeight + watermarkGap;
    const textX = wx + badgePadX + (logo ? logoWidth + badgeGap : 0);
    watermark = {
      rect: Skia.XYWHRect(wx, wy, watermarkWidth, watermarkHeight),
      text: {
        paragraph: watermarkParagraph,
        x: textX,
        y: wy + (watermarkHeight - watermarkParagraph.getHeight()) / 2,
      },
      logo: logo
        ? Skia.XYWHRect(wx + badgePadX * 0.7, wy + (watermarkHeight - logoHeight) / 2, logoWidth, logoHeight)
        : null,
    };
  }

  const boundsTop = Math.min(panelY, watermark ? watermark.rect.y : panelY);
  const bounds = Skia.XYWHRect(panelX, boundsTop, panelWidth, stackHeight);

  return {
    width,
    height,
    bounds,
    panel,
    radius,
    map: mapRect,
    mapRadius: 1.3 * u,
    watermark,
    blocks,
    unit: u,
  };
}

/**
 * Computes the stamp layout for a canvas of `width` x `height`. Sizes are relative
 * to the short side, so a preview and a 12 MP photo with the same aspect ratio look
 * the same. If the stamp would not fit (very wide images, large text), it is scaled
 * down until it stays inside the image.
 */
export function layoutStamp(
  Skia: SkiaApi,
  fonts: StampFonts,
  input: StampRenderInput,
  width: number,
  height: number,
): StampLayout {
  let unit = Math.min(width, height) / 100;
  let layout = layoutWithUnit(Skia, fonts, input, width, height, unit);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const available = height - 4.8 * unit;
    if (layout.bounds.height <= available) break;
    unit *= Math.max(0.5, (available / layout.bounds.height) * 0.97);
    layout = layoutWithUnit(Skia, fonts, input, width, height, unit);
  }
  return layout;
}

function pinPath(Skia: SkiaApi, cx: number, tipY: number, r: number) {
  const top = tipY - 1.9 * r;
  const svg =
    `M ${cx} ${tipY} ` +
    `C ${cx - 0.35 * r} ${tipY - 0.9 * r} ${cx - r} ${tipY - 1.25 * r} ${cx - r} ${top} ` +
    `A ${r} ${r} 0 1 1 ${cx + r} ${top} ` +
    `C ${cx + r} ${tipY - 1.25 * r} ${cx + 0.35 * r} ${tipY - 0.9 * r} ${cx} ${tipY} Z`;
  return { path: Skia.Path.MakeFromSVGString(svg), headY: top };
}

function drawPin(Skia: SkiaApi, canvas: SkCanvas, cx: number, tipY: number, r: number, color: string) {
  const { path, headY } = pinPath(Skia, cx, tipY, r);
  if (!path) return;
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(Skia.Color(color));
  canvas.drawPath(path, fill);
  const stroke = Skia.Paint();
  stroke.setAntiAlias(true);
  stroke.setStyle(PAINT_STROKE);
  stroke.setStrokeWidth(Math.max(1, r * 0.16));
  stroke.setColor(Skia.Color('#FFFFFF'));
  canvas.drawPath(path, stroke);
  const dot = Skia.Paint();
  dot.setAntiAlias(true);
  dot.setColor(Skia.Color('#FFFFFF'));
  canvas.drawCircle(cx, headY, r * 0.42, dot);
}

function drawMapArea(
  Skia: SkiaApi,
  fonts: StampFonts,
  canvas: SkCanvas,
  layout: StampLayout,
  mapImage: SkImage | null,
) {
  const rect = layout.map;
  if (!rect) return;
  const u = layout.unit;
  const rrect = Skia.RRectXY(rect, layout.mapRadius, layout.mapRadius);
  canvas.save();
  canvas.clipRRect(rrect, CLIP_INTERSECT, true);
  if (mapImage) {
    // Center-crop the map tile into the square; the marker marks the exact coordinates
    // because the map image is generated centered on them.
    const iw = mapImage.width();
    const ih = mapImage.height();
    const side = Math.min(iw, ih);
    const src = Skia.XYWHRect((iw - side) / 2, (ih - side) / 2, side, side);
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    canvas.drawImageRect(mapImage, src, rect, paint);
    // Attribution required by OpenStreetMap, inside the map so it is never cropped away.
    const credit = makeParagraph(Skia, fonts, '© OpenStreetMap contributors', {
      size: Math.max(0.95 * u, rect.width * 0.058),
      color: 'rgba(255,255,255,0.95)',
      maxLines: 2,
      width: rect.width - 0.8 * u,
      shadow: 0,
    });
    const creditHeight = credit.getHeight() + 0.3 * u;
    const strip = Skia.Paint();
    strip.setColor(Skia.Color('rgba(0,0,0,0.55)'));
    canvas.drawRect(Skia.XYWHRect(rect.x, rect.y + rect.height - creditHeight, rect.width, creditHeight), strip);
    credit.paint(canvas, rect.x + 0.4 * u, rect.y + rect.height - creditHeight + 0.15 * u);
    canvas.restore();
    // The map image is centred on the exact coordinates, so the pin tip marks the spot.
    drawPin(Skia, canvas, rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width * 0.09, COLOR_PIN);
    return;
  }
  // No map data: an explicit, informative card. It never imitates a real map.
  const bg = Skia.Paint();
  bg.setColor(Skia.Color('rgba(255,255,255,0.10)'));
  canvas.drawRect(rect, bg);
  canvas.restore();
  const border = Skia.Paint();
  border.setAntiAlias(true);
  border.setStyle(PAINT_STROKE);
  border.setStrokeWidth(Math.max(1, 0.18 * u));
  border.setColor(Skia.Color('rgba(255,255,255,0.28)'));
  canvas.drawRRect(rrect, border);
  const r = rect.width * 0.1;
  drawPin(Skia, canvas, rect.x + rect.width / 2, rect.y + rect.height * 0.5, r, '#8E9299');
  const label = makeParagraph(Skia, fonts, 'Map unavailable', {
    size: Math.max(1.6 * u, rect.width * 0.105),
    color: 'rgba(255,255,255,0.75)',
    maxLines: 2,
    width: rect.width - 1.2 * u,
    shadow: 0,
  });
  const labelWidth = label.getLongestLine();
  label.paint(canvas, rect.x + (rect.width - labelWidth) / 2, rect.y + rect.height * 0.62);
}

/** Draws the stamp described by `layout` onto `canvas` (in the same coordinate space). */
export function drawStamp(
  Skia: SkiaApi,
  fonts: StampFonts,
  canvas: SkCanvas,
  layout: StampLayout,
  input: StampRenderInput,
) {
  const background = Skia.Paint();
  background.setAntiAlias(true);
  background.setColor(Skia.Color(`rgba(0,0,0,${input.style.backgroundOpacity})`));
  if (input.style.backgroundOpacity > 0) {
    canvas.drawRRect(Skia.RRectXY(layout.panel, layout.radius, layout.radius), background);
  }

  if (layout.watermark) {
    const pill = Skia.Paint();
    pill.setAntiAlias(true);
    pill.setColor(Skia.Color(`rgba(0,0,0,${Math.max(0.35, input.style.backgroundOpacity)})`));
    const r = layout.watermark.rect.height / 2;
    canvas.drawRRect(Skia.RRectXY(layout.watermark.rect, r, r), pill);
    const logo = input.logoImage;
    if (layout.watermark.logo && logo) {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      canvas.drawImageRect(
        logo,
        Skia.XYWHRect(0, 0, logo.width(), logo.height()),
        layout.watermark.logo,
        paint,
      );
    }
    layout.watermark.text.paragraph.paint(canvas, layout.watermark.text.x, layout.watermark.text.y);
  }

  drawMapArea(Skia, fonts, canvas, layout, input.mapImage);

  for (const block of layout.blocks) {
    block.paragraph.paint(canvas, block.x, block.y);
  }
}

/** Loads font files (raw bytes) into a provider usable by the renderer. */
export function createStampFonts(
  Skia: SkiaApi,
  fontData: { regular: Uint8Array; semibold: Uint8Array },
): StampFonts {
  const provider = Skia.TypefaceFontProvider.Make();
  for (const bytes of [fontData.regular, fontData.semibold]) {
    const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(bytes));
    if (typeface) provider.registerFont(typeface, STAMP_FONT_FAMILY);
  }
  return { provider, family: STAMP_FONT_FAMILY };
}
