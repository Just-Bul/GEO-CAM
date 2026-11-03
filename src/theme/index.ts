/**
 * Colours are taken from the GEO-CAM logo (assets/images/geo-cam-logo-source.png):
 * deep pin blue, sky-blue "GEO" lettering, cyan glow, silver "CAM", on black with
 * the navy of the globe for raised surfaces.
 */
export const brand = {
  blue: '#016BFB',
  sky: '#0098FD',
  cyan: '#00CBFE',
  silver: '#D1D7E1',
  navy: '#001854',
} as const;

export const colors = {
  black: '#000000',
  background: '#000000',
  surface: '#07101F',
  surfaceRaised: '#0D1A30',
  border: '#1B2A44',
  white: '#FFFFFF',
  text: '#FFFFFF',
  textMuted: '#A9B4C6',
  textFaint: '#6C7890',
  accent: brand.sky,
  accentStrong: brand.blue,
  accentPressed: '#0056CC',
  glow: brand.cyan,
  silver: brand.silver,
  success: '#34C759',
  warning: '#FFB020',
  danger: '#FF453A',
  overlay: 'rgba(0, 6, 20, 0.5)',
  overlayStrong: 'rgba(0, 6, 20, 0.72)',
  recording: '#FF3B30',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15 },
  caption: { fontSize: 12 },
  small: { fontSize: 11 },
} as const;

/** Minimum touch target recommended by both platform guidelines. */
export const HIT_TARGET = 44;

/** Soft brand-coloured glow (iOS shadow; Android approximates with elevation). */
export const glowShadow = {
  shadowColor: brand.cyan,
  shadowOpacity: 0.7,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 0 },
  elevation: 8,
} as const;
