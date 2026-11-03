import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '../components/Toast';
import { deleteCapture, resolveMediaUri, shareCaptures } from '../features/gallery/galleryService';
import { useCaptures, type CaptureRecord } from '../features/gallery/mediaRepository';
import { colors, HIT_TARGET, radii, spacing } from '../theme';
import { userMessage } from '../utils/errors';
import { formatAccuracy, formatAge, formatDuration, formatLatitude, formatLongitude, formatStampDate, formatStampTime } from '../utils/format';

export default function MediaPreviewScreen() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  const record = useCaptures().find((item) => item.assetId === assetId);
  const insets = useSafeAreaInsets();
  const [showDetails, setShowDetails] = useState(false);
  const [working, setWorking] = useState(false);

  if (!record) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.muted}>This item is no longer available.</Text>
      </View>
    );
  }

  const onShare = async () => {
    setWorking(true);
    try {
      await shareCaptures([record]);
    } catch (error) {
      showToast(userMessage(error, 'share-unavailable'), 'error');
    } finally {
      setWorking(false);
    }
  };

  const onDelete = () =>
    Alert.alert(
      record.kind === 'photo' ? 'Delete photo?' : 'Delete video?',
      'It will be removed from your device’s photo library.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setWorking(true);
            try {
              await deleteCapture(record);
              router.back();
            } catch (error) {
              showToast(userMessage(error, 'delete-failed'), 'error');
              setWorking(false);
            }
          },
        },
      ],
    );

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={onShare}
              disabled={working}
              accessibilityRole="button"
              accessibilityLabel={record.kind === 'photo' ? 'Share photo' : 'Share video'}
              hitSlop={8}
              style={styles.headerShare}
            >
              <Ionicons name="share-social" size={24} color={colors.white} />
            </Pressable>
          ),
        }}
      />
      <View style={styles.media}>
        {record.kind === 'photo' ? (
          <Image source={{ uri: record.assetId }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel="Captured photo" />
        ) : (
          <VideoPlayer record={record} />
        )}
      </View>

      {showDetails ? (
        <ScrollView style={[styles.details, { paddingBottom: insets.bottom }]}>
          <Details record={record} />
        </ScrollView>
      ) : null}

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Action icon="share-outline" label="Share" onPress={onShare} disabled={working} />
        <Action icon="information-circle-outline" label={showDetails ? 'Hide details' : 'Details'} onPress={() => setShowDetails((v) => !v)} />
        <Action icon="trash-outline" label="Delete" onPress={onDelete} disabled={working} danger />
      </View>
      {working ? <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.white} /> : null}
    </View>
  );
}

function VideoPlayer({ record }: { record: CaptureRecord }) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    resolveMediaUri(record).then(setUri).catch(() => setFailed(true));
  }, [record]);
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = false;
  });
  if (failed) return <Text style={[styles.muted, { textAlign: 'center' }]}>The video file could not be opened.</Text>;
  if (!uri) return <ActivityIndicator color={colors.white} />;
  return <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls contentFit="contain" />;
}

function Details({ record }: { record: CaptureRecord }) {
  const date = new Date(record.capturedAt);
  const loc = record.location;
  const rows: [string, string][] = [
    ['Captured', `${formatStampDate(date)} ${formatStampTime(date, true)} ${record.utcOffset}`],
    ['Time zone', record.timeZone ?? 'Unknown'],
    ['File', record.fileName],
    ['Size', `${record.width} × ${record.height}${record.durationMs ? ` · ${formatDuration(record.durationMs / 1000)}` : ''}`],
    [
      'Stamp',
      record.stamped
        ? record.videoStampMode
          ? `Embedded (${record.videoStampMode})`
          : 'Embedded'
        : record.stampIssue
          ? `Not embedded (${record.stampIssue.replace(/-/g, ' ')})`
          : 'Off',
    ],
  ];
  if (loc) {
    rows.push(
      ['Latitude', formatLatitude(loc.latitude, 'decimal')],
      ['Longitude', formatLongitude(loc.longitude, 'decimal')],
      ['Accuracy', formatAccuracy(loc.accuracy) ?? 'Not reported'],
      [
        'Location',
        loc.freshness === 'current'
          ? 'Live GPS fix'
          : `Cached, ${formatAge(loc.ageMs ?? 0)} old at capture`,
      ],
    );
    if (loc.altitude != null) rows.push(['Altitude', `${Math.round(loc.altitude)} m`]);
    if (loc.mocked) rows.push(['Warning', 'Reported by a mock location provider']);
  } else {
    rows.push(['Location', 'Not available at capture']);
  }
  if (record.addressLine) rows.push(['Address', record.addressLine]);
  return (
    <View style={styles.detailCard}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{label}</Text>
          <Text style={styles.detailValue} selectable>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.action, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={24} color={danger ? colors.danger : colors.white} />
      <Text style={[styles.actionText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  headerShare: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: HIT_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 152, 253, 0.85)',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted, fontSize: 15, padding: spacing.xl },
  media: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  details: { maxHeight: '45%', backgroundColor: colors.surface },
  detailCard: { padding: spacing.lg, gap: spacing.sm },
  detailRow: { flexDirection: 'row', gap: spacing.md },
  detailLabel: { color: colors.textMuted, fontSize: 13, width: 90 },
  detailValue: { color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
    backgroundColor: colors.overlayStrong,
  },
  action: { alignItems: 'center', minWidth: HIT_TARGET * 1.6, minHeight: HIT_TARGET, gap: 2, borderRadius: radii.md },
  actionText: { color: colors.white, fontSize: 12 },
});
