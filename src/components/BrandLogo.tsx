import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

/**
 * GEO-CAM artwork generated from assets/images/geo-cam-logo-source.png by
 * scripts/generate-brand-assets.py (transparent, so it sits on any dark surface).
 */
const SOURCES = {
  full: require('../../assets/images/logo-full.png'),
  emblem: require('../../assets/images/logo-emblem.png'),
  wordmark: require('../../assets/images/logo-wordmark.png'),
} as const;

/** Width / height of each generated asset. */
const ASPECT = {
  full: 1,
  emblem: 512 / 407,
  wordmark: 640 / 166,
} as const;

export type BrandLogoVariant = keyof typeof SOURCES;

export function BrandLogo({
  variant,
  height,
  style,
}: {
  variant: BrandLogoVariant;
  height: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={SOURCES[variant]}
      style={[{ height, width: height * ASPECT[variant] }, style]}
      contentFit="contain"
      accessibilityRole="image"
      accessibilityLabel="GEO-CAM"
    />
  );
}
