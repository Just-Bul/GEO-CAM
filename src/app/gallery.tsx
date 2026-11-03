import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { presentPermissionsPicker } from 'expo-media-library';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '../components/BrandLogo';
import { showToast } from '../components/Toast';
import { assetExists, deleteCaptures, shareCaptures } from '../features/gallery/galleryService';
import { removeCaptures, useCaptures, type CaptureRecord } from '../features/gallery/mediaRepository';
import { getMediaAccess, requestMediaAccess, type MediaAccess } from '../features/media/mediaLibraryService';
import { colors, HIT_TARGET, radii, spacing } from '../theme';
import { userMessage } from '../utils/errors';
import { formatDuration } from '../utils/format';

type Filter = 'all' | 'photo' | 'video';

export default function GalleryScreen() {
  const captures = useCaptures();
  const [filter, setFilter] = useState<Filter>('all');
  const [access, setAccess] = useState<MediaAccess | null>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const columns = width > 600 ? 5 : 3;
  const size = Math.floor((width - spacing.xs * (columns + 1)) / columns);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        let current = await getMediaAccess();
        if (current === 'undetermined') current = await requestMediaAccess();
        if (active) setAccess(current);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const items = useMemo(
    () => captures.filter((record) => filter === 'all' || record.kind === filter),
    [captures, filter],
  );

  // Thumbnails that fail to load are checked; records of media deleted elsewhere are dropped.
  const onThumbError = useCallback(async (record: CaptureRecord) => {
    if (!(await assetExists(record.assetId))) removeCaptures([record.assetId]);
  }, []);

  // Selection mode: null = browsing; a set = choosing items to share or delete.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [working, setWorking] = useState(false);
  const selecting = selected != null;
  const selectedRecords = useMemo(
    () => (selected ? items.filter((record) => selected.has(record.assetId)) : []),
    [items, selected],
  );
  const allSelected = selecting && items.length > 0 && selectedRecords.length === items.length;

  const toggle = (assetId: string) =>
    setSelected((previous) => {
      const next = new Set(previous ?? []);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });

  // The Android back button leaves selection mode instead of the screen.
  useFocusEffect(
    useCallback(() => {
      if (!selecting) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelected(null);
        return true;
      });
      return () => subscription.remove();
    }, [selecting]),
  );

  const onShare = async () => {
    if (!selectedRecords.length) return;
    setWorking(true);
    try {
      await shareCaptures(selectedRecords);
      setSelected(null);
    } catch (error) {
      showToast(userMessage(error, 'share-unavailable'), 'error');
    } finally {
      setWorking(false);
    }
  };

  const onDelete = () => {
    const count = selectedRecords.length;
    if (!count) return;
    Alert.alert(
      count === 1 ? 'Delete 1 item?' : `Delete ${count} items?`,
      "They will be removed from your device's photo library.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setWorking(true);
            try {
              await deleteCaptures(selectedRecords);
              setSelected(null);
            } catch (error) {
              showToast(userMessage(error, 'delete-failed'), 'error');
            } finally {
              setWorking(false);
            }
          },
        },
      ],
    );
  };

  const denied = access === 'denied' || access === 'blocked';

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: selecting ? `${selectedRecords.length} selected` : 'Gallery',
          headerRight: () =>
            items.length ? (
              <Pressable
                onPress={() => setSelected(selecting ? null : new Set())}
                accessibilityRole="button"
                hitSlop={8}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonText}>{selecting ? 'Cancel' : 'Select'}</Text>
              </Pressable>
            ) : null,
        }}
      />

      <View style={styles.filters} accessibilityRole="tablist">
        {(['all', 'photo', 'video'] as Filter[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setFilter(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === key }}
            style={[styles.filter, filter === key && styles.filterSelected]}
          >
            <Text style={[styles.filterText, filter === key && styles.filterTextSelected]}>
              {key === 'all' ? 'All' : key === 'photo' ? 'Photos' : 'Videos'}
            </Text>
          </Pressable>
        ))}
      </View>

      {denied ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Photo library access is off, so the gallery cannot show your captures.
          </Text>
          <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Text style={styles.bannerLink}>Open Settings</Text>
          </Pressable>
        </View>
      ) : access === 'limited' ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Limited access: only items you selected (and new GEO-CAM captures) are visible.
          </Text>
          <Pressable onPress={() => presentPermissionsPicker().catch(() => Linking.openSettings())} accessibilityRole="button">
            <Text style={styles.bannerLink}>Manage</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={items}
        key={columns}
        numColumns={columns}
        keyExtractor={(item) => item.assetId}
        contentContainerStyle={{ padding: spacing.xs / 2 }}
        ListFooterComponent={selecting ? <View style={{ height: 96 }} /> : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <BrandLogo variant="emblem" height={110} style={{ opacity: 0.85 }} />
            <Text style={styles.emptyText}>No captures yet. Photos and videos you take appear here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = selected?.has(item.assetId) ?? false;
          return (
            <Pressable
              onPress={() =>
                selecting
                  ? toggle(item.assetId)
                  : router.push({ pathname: '/media-preview', params: { assetId: item.assetId } })
              }
              onLongPress={() => {
                if (!selecting) setSelected(new Set([item.assetId]));
              }}
              delayLongPress={300}
              accessibilityRole={selecting ? 'checkbox' : 'button'}
              accessibilityState={selecting ? { checked: isSelected } : undefined}
              accessibilityLabel={`${item.kind === 'photo' ? 'Photo' : 'Video'} from ${new Date(item.capturedAt).toLocaleString()}`}
              accessibilityHint={selecting ? undefined : 'Long-press to select several items'}
              style={{ margin: spacing.xs / 2 }}
            >
              <Image
                source={{ uri: item.assetId }}
                style={{ width: size, height: size, borderRadius: radii.sm, backgroundColor: colors.surface }}
                contentFit="cover"
                recyclingKey={item.assetId}
                onError={() => onThumbError(item)}
              />
              {item.kind === 'video' ? (
                <View style={styles.badge}>
                  <Ionicons name="videocam" size={11} color={colors.white} />
                  <Text style={styles.badgeText}>{item.durationMs ? formatDuration(item.durationMs / 1000) : ''}</Text>
                </View>
              ) : null}
              {!item.stamped ? (
                <View style={[styles.badge, styles.badgeLeft]}>
                  <Text style={styles.badgeText}>No stamp</Text>
                </View>
              ) : null}
              {selecting ? (
                <View style={[StyleSheet.absoluteFill, styles.selectLayer, isSelected && styles.selectLayerOn]}>
                  <View style={[styles.check, isSelected && styles.checkOn]}>
                    {isSelected ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />

      {selecting ? (
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <BarButton
            icon={allSelected ? 'close-circle-outline' : 'checkmark-done-outline'}
            label={allSelected ? 'Clear' : 'Select all'}
            onPress={() => setSelected(allSelected ? new Set() : new Set(items.map((record) => record.assetId)))}
          />
          <BarButton
            icon="share-social"
            label={selectedRecords.length ? `Share (${selectedRecords.length})` : 'Share'}
            onPress={onShare}
            disabled={!selectedRecords.length || working}
            primary
          />
          <BarButton
            icon="trash-outline"
            label="Delete"
            onPress={onDelete}
            disabled={!selectedRecords.length || working}
            danger
          />
        </View>
      ) : null}
      {working ? <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.white} /> : null}
    </View>
  );
}

function BarButton({
  icon,
  label,
  onPress,
  disabled,
  primary,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const color = danger ? colors.danger : primary ? colors.accent : colors.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.barButton, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.barButtonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  filters: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  filter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterSelected: { backgroundColor: colors.accent },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  filterTextSelected: { color: colors.white },
  banner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    gap: spacing.sm,
  },
  bannerText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  bannerLink: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 120, gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: 15, textAlign: 'center', paddingHorizontal: spacing.xl },
  badge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeLeft: { right: undefined, left: 4 },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '600' },
  headerButton: { paddingHorizontal: spacing.md, minHeight: HIT_TARGET, justifyContent: 'center' },
  headerButtonText: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  selectLayer: { borderRadius: radii.sm, backgroundColor: 'rgba(0,0,0,0.15)' },
  selectLayerOn: { borderWidth: 3, borderColor: colors.accent, backgroundColor: 'rgba(0,152,253,0.18)' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barButton: { alignItems: 'center', minWidth: HIT_TARGET * 2, minHeight: HIT_TARGET, gap: 2 },
  barButtonText: { fontSize: 12, fontWeight: '600' },
});
