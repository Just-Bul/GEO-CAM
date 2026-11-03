import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { classifyReading } from '../features/location/locationFreshness';
import type { LocationSnapshot } from '../features/location/locationTypes';
import type { LocationSettings } from '../types/settings';
import { colors, radii, spacing } from '../theme';
import { formatAccuracy, formatAge } from '../utils/format';

export interface LocationStatusInfo {
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}

/** One place that turns location state into honest, user-facing wording. */
export function describeLocation(
  snapshot: LocationSnapshot,
  now: number,
  settings: LocationSettings,
): LocationStatusInfo {
  const { status, permission, reading } = snapshot;
  if (permission === 'denied' || permission === 'blocked' || status === 'permission-required') {
    return {
      label: 'Location off',
      color: colors.danger,
      icon: 'location-outline',
      description: 'Location permission is not granted. Photos will be stamped without a location.',
    };
  }
  if (status === 'services-disabled') {
    return {
      label: 'GPS disabled',
      color: colors.danger,
      icon: 'location-outline',
      description: 'Location services are turned off on this device.',
    };
  }
  const { freshness, ageMs } = classifyReading(reading, now, settings);
  const approximate = permission === 'granted-approximate';
  if (freshness === 'current' && reading) {
    const accuracy = formatAccuracy(reading.accuracy) ?? 'accuracy unknown';
    return {
      label: approximate ? `Approx. ${accuracy}` : `GPS ${accuracy}`,
      color: reading.mocked ? colors.warning : approximate ? colors.warning : colors.success,
      icon: 'navigate',
      description: reading.mocked
        ? 'The device reports this location comes from a mock location provider.'
        : approximate
          ? 'Only approximate location is allowed, so coordinates can be far off. Tap "Use precise location" for exact coordinates.'
          : `Live location, reported accuracy ${accuracy}.`,
    };
  }
  if (freshness === 'cached' && reading) {
    return {
      label: `Cached · ${formatAge(ageMs ?? 0)}`,
      color: colors.warning,
      icon: 'time-outline',
      description: 'No live fix yet. The last known location is shown and will be labelled as cached.',
    };
  }
  if (status === 'error') {
    return {
      label: 'No GPS',
      color: colors.danger,
      icon: 'alert-circle-outline',
      description: 'The location could not be read.',
    };
  }
  return {
    label: 'Searching GPS…',
    color: colors.textMuted,
    icon: 'locate-outline',
    description: 'Waiting for a location fix. This can take longer indoors.',
  };
}

export function LocationStatus({ info, onPress }: { info: LocationStatusInfo; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Location status: ${info.label}`}
      accessibilityHint={info.description}
      hitSlop={8}
      style={styles.pill}
    >
      <View style={[styles.dot, { backgroundColor: info.color }]} />
      <Text style={styles.text} numberOfLines={1}>
        {info.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  text: { color: colors.white, fontSize: 12, fontWeight: '600' },
});
