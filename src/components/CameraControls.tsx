import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CaptureMode } from '../types/settings';
import { colors, glowShadow, HIT_TARGET, radii, spacing } from '../theme';
import { CaptureThumbnail } from './CaptureThumbnail';

interface Props {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  onShutter: () => void;
  onFlip: () => void;
  onOpenGallery: () => void;
  thumbnailUri: string | null;
  recording: boolean;
  busy: boolean;
  disabled: boolean;
  bottomInset: number;
}

const MODES: { key: CaptureMode; label: string }[] = [
  { key: 'photo', label: 'PHOTO' },
  { key: 'video', label: 'VIDEO' },
];

export function CameraControls({
  mode,
  onModeChange,
  onShutter,
  onFlip,
  onOpenGallery,
  thumbnailUri,
  recording,
  busy,
  disabled,
  bottomInset,
}: Props) {
  const shutterLabel =
    mode === 'photo' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording';

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, spacing.lg) }]}>
      <View style={styles.modes} accessibilityRole="tablist">
        {MODES.map((item) => {
          const selected = item.key === mode;
          return (
            <Pressable
              key={item.key}
              onPress={() => onModeChange(item.key)}
              disabled={recording || busy}
              accessibilityRole="tab"
              accessibilityState={{ selected, disabled: recording || busy }}
              accessibilityLabel={`${item.label.toLowerCase()} mode`}
              style={styles.modeButton}
              hitSlop={6}
            >
              <Text style={[styles.modeText, selected && styles.modeSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.row}>
        <CaptureThumbnail uri={thumbnailUri} onPress={onOpenGallery} disabled={recording} />

        <Pressable
          onPress={onShutter}
          disabled={disabled || busy}
          accessibilityRole="button"
          accessibilityLabel={shutterLabel}
          accessibilityState={{ disabled: disabled || busy, busy }}
          style={({ pressed }) => [styles.shutterOuter, pressed && { opacity: 0.8 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} size="large" />
          ) : mode === 'photo' ? (
            <View style={styles.shutterInner} />
          ) : recording ? (
            <View style={styles.stopSquare} />
          ) : (
            <View style={styles.recordDot} />
          )}
        </Pressable>

        <Pressable
          onPress={onFlip}
          disabled={recording || busy}
          accessibilityRole="button"
          accessibilityLabel="Switch between front and rear camera"
          accessibilityState={{ disabled: recording || busy }}
          style={[styles.roundButton, (recording || busy) && styles.dimmed]}
        >
          <Ionicons name="camera-reverse-outline" size={26} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
    backgroundColor: colors.overlayStrong,
  },
  modes: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    gap: spacing.lg,
  },
  modeButton: { paddingHorizontal: spacing.sm, paddingVertical: 6, minHeight: 32 },
  modeText: { color: colors.textMuted, fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  modeSelected: { color: colors.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    // Brand glow ring around the shutter, as in the GEO-CAM logo.
    ...glowShadow,
    backgroundColor: 'rgba(0, 152, 253, 0.18)',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.white },
  recordDot: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.recording },
  stopSquare: { width: 30, height: 30, borderRadius: radii.sm, backgroundColor: colors.recording },
  roundButton: {
    width: HIT_TARGET + 8,
    height: HIT_TARGET + 8,
    borderRadius: (HIT_TARGET + 8) / 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.4 },
});
