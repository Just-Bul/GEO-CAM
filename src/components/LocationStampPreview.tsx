import { createPicture, Skia, SkiaPictureView, type SkImage } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { drawStamp, layoutStamp, type StampFonts } from '../features/stamping/stampRenderer';
import type { StampContent, StampStyle } from '../features/stamping/stampTemplates';

interface Props {
  width: number;
  height: number;
  fonts: StampFonts;
  content: StampContent;
  style: StampStyle;
  mapImage: SkImage | null;
  logoImage: SkImage | null;
}

/**
 * Live stamp drawn with exactly the same renderer as the saved photo, sized to the
 * preview frame. Because layout is proportional to the frame, what you see here
 * is what gets burned into the image.
 *
 * The stamp is recorded into an SkPicture and shown with `SkiaPictureView`
 * directly. Skia's declarative `<Canvas>` (its React reconciler) crashed React
 * Native 0.86's Fabric mounting on Android (SIGSEGV in
 * MountingCoordinator::pullTransaction), and is not needed for a static picture.
 */
function LocationStampPreviewBase({ width, height, fonts, content, style, mapImage, logoImage }: Props) {
  const picture = useMemo(() => {
    if (width <= 0 || height <= 0) return null;
    const input = { content, style, mapImage, logoImage };
    return createPicture((canvas) => {
      const layout = layoutStamp(Skia, fonts, input, width, height);
      drawStamp(Skia, fonts, canvas, layout, input);
    }, { width, height });
  }, [width, height, fonts, content, style, mapImage, logoImage]);

  if (!picture) return null;
  return (
    <SkiaPictureView
      picture={picture}
      opaque={false}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { width, height }]}
    />
  );
}

export const LocationStampPreview = memo(LocationStampPreviewBase);
