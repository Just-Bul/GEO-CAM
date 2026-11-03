import { ImageFormat, Skia, type SkImage, type SkSurface } from '@shopify/react-native-skia';

import { AppError, logError } from '../../utils/errors';
import { buildExifSegment, insertExif, type ExifInput } from '../media/exifWriter';
import { tempFile } from '../media/temporaryFileService';
import { drawStamp, layoutStamp, type StampFonts } from './stampRenderer';
import type { StampContent, StampStyle } from './stampTemplates';

/** Above this many pixels the photo is scaled down before stamping to stay within memory. */
const MAX_OUTPUT_PIXELS = 50_000_000;

export interface PhotoStampJob {
  sourceUri: string;
  outputName: string;
  /** null → no stamp drawn (used when only EXIF should be added). */
  stamp: {
    content: StampContent;
    style: StampStyle;
    mapImage: SkImage | null;
    logoImage: SkImage | null;
  } | null;
  fonts: StampFonts;
  quality: number;
  exif: Omit<ExifInput, 'width' | 'height'>;
}

export interface PhotoStampResult {
  uri: string;
  width: number;
  height: number;
  bytes: number;
}

function makeSurface(width: number, height: number): SkSurface | null {
  // GPU surface first (fast); raster fallback when the size exceeds the GPU's texture limit.
  return Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
}

function looksLikeJpeg(bytes: Uint8Array) {
  return (
    bytes.length > 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

/**
 * Burns the stamp into a full-resolution copy of the photo and writes it as a
 * new JPEG in temporary storage. The source file is never modified.
 */
export async function stampPhoto(job: PhotoStampJob): Promise<PhotoStampResult> {
  let source: SkImage | null = null;
  let surface: SkSurface | null = null;
  let snapshot: SkImage | null = null;
  try {
    const data = await Skia.Data.fromURI(job.sourceUri);
    source = Skia.Image.MakeImageFromEncoded(data);
    if (!source) throw new AppError('invalid-media-file');

    const sourceWidth = source.width();
    const sourceHeight = source.height();
    const scale = Math.min(1, Math.sqrt(MAX_OUTPUT_PIXELS / (sourceWidth * sourceHeight)));
    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);

    surface = makeSurface(width, height);
    if (!surface) throw new AppError('image-too-large');
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    canvas.drawImageRect(
      source,
      Skia.XYWHRect(0, 0, sourceWidth, sourceHeight),
      Skia.XYWHRect(0, 0, width, height),
      paint,
    );

    if (job.stamp) {
      const input = job.stamp;
      const layout = layoutStamp(Skia, job.fonts, input, width, height);
      drawStamp(Skia, job.fonts, canvas, layout, input);
    }
    surface.flush();
    snapshot = surface.makeImageSnapshot();
    const encoded = snapshot.encodeToBytes(ImageFormat.JPEG, Math.round(job.quality * 100));
    if (!encoded || !looksLikeJpeg(encoded)) throw new AppError('photo-processing-failed');

    const withExif = insertExif(encoded, buildExifSegment({ ...job.exif, width, height }));

    const file = tempFile(job.outputName);
    file.create({ intermediates: true, overwrite: true });
    file.write(withExif);

    // Validate what actually landed on disk before anyone calls it saved.
    if (!file.exists || file.size !== withExif.length) {
      throw new AppError('photo-processing-failed');
    }
    return { uri: file.uri, width, height, bytes: withExif.length };
  } catch (error) {
    logError('stampPhoto', error);
    if (error instanceof AppError) throw error;
    const message = String((error as Error)?.message ?? '').toLowerCase();
    if (message.includes('space') || message.includes('enospc')) throw new AppError('low-storage', error);
    if (message.includes('memory') || message.includes('alloc')) throw new AppError('image-too-large', error);
    throw new AppError('photo-processing-failed', error);
  } finally {
    snapshot?.dispose();
    surface?.dispose();
    source?.dispose();
  }
}
