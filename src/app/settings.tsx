import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '../components/BrandLogo';
import { ChoiceRow, Row, Section, settingsStyles, SliderRow, ToggleRow } from '../components/SettingsUI';
import { showToast } from '../components/Toast';
import { isVideoStampingAvailable } from '../../modules/video-stamping';
import { addressCacheSize, clearAddressCache } from '../features/location/addressResolver';
import { locationStore, refreshLocationPermission, requestPreciseLocation } from '../features/location/locationService';
import { clearTileCache, tileCacheUsage } from '../features/maps/tileCache';
import { getMediaAccess, type MediaAccess } from '../features/media/mediaLibraryService';
import { cleanTemporaryFiles, temporaryUsage } from '../features/media/temporaryFileService';
import { resetSettings, updateSettings, useSettings } from '../features/settings/settingsService';
import { colors, spacing } from '../theme';
import { formatBytes } from '../utils/format';
import { useStore } from '../utils/store';

const PERMISSION_TEXT: Record<string, string> = {
  'granted-precise': 'Precise',
  'granted-approximate': 'Approximate only',
  denied: 'Denied',
  blocked: 'Blocked',
  undetermined: 'Not asked yet',
};

const MEDIA_TEXT: Record<MediaAccess, string> = {
  all: 'Full access',
  limited: 'Limited (selected items)',
  denied: 'Denied',
  blocked: 'Blocked',
  undetermined: 'Not asked yet',
};

export default function SettingsScreen() {
  const settings = useSettings();
  const location = useStore(locationStore);
  const [mediaAccess, setMediaAccess] = useState<MediaAccess>('undetermined');
  const [temp, setTemp] = useState({ files: 0, bytes: 0 });
  const [addresses, setAddresses] = useState(0);
  const [tiles, setTiles] = useState({ files: 0, bytes: 0 });

  useFocusEffect(
    useCallback(() => {
      refreshLocationPermission();
      getMediaAccess().then(setMediaAccess);
      setTemp(temporaryUsage());
      addressCacheSize().then(setAddresses);
      setTiles(tileCacheUsage());
    }, []),
  );

  const { camera, storage, privacy, location: loc } = settings;

  return (
    <ScrollView style={settingsStyles.screen} contentContainerStyle={settingsStyles.content}>
      <Section title="Stamp">
        <Row label="Stamp layout and fields" value={settings.stamp.enabled ? 'On' : 'Off'} onPress={() => router.push('/stamp-settings')} />
      </Section>

      <Section title="Camera">
        <ChoiceRow
          label="Default camera"
          options={[
            { value: 'back', label: 'Rear' },
            { value: 'front', label: 'Front' },
          ]}
          value={camera.defaultFacing}
          onChange={(value) => updateSettings('camera', { defaultFacing: value })}
        />
        <ChoiceRow
          label="Default mode"
          options={[
            { value: 'photo', label: 'Photo' },
            { value: 'video', label: 'Video' },
          ]}
          value={camera.defaultMode}
          onChange={(value) => updateSettings('camera', { defaultMode: value })}
        />
        <ChoiceRow
          label="Flash (photo)"
          options={[
            { value: 'off', label: 'Off' },
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'On' },
          ]}
          value={camera.flash}
          onChange={(value) => updateSettings('camera', { flash: value })}
        />
        <ChoiceRow
          label="Video stamp"
          description="Fixed: location and time from the start of the recording. Dynamic: updates every second using real GPS readings received while recording."
          options={[
            { value: 'fixed', label: 'Fixed' },
            { value: 'dynamic', label: 'Dynamic' },
          ]}
          value={camera.videoStampMode}
          onChange={(value) => updateSettings('camera', { videoStampMode: value })}
        />
        <ToggleRow label="Grid lines" value={camera.showGrid} onChange={(value) => updateSettings('camera', { showGrid: value })} />
        <ToggleRow
          label="Shutter sound"
          description="Some regions require the shutter sound and the system may ignore this setting."
          value={camera.shutterSound}
          onChange={(value) => updateSettings('camera', { shutterSound: value })}
        />
        <ToggleRow label="Remember zoom" value={camera.rememberZoom} onChange={(value) => updateSettings('camera', { rememberZoom: value })} />
      </Section>

      <Section
        title="Location"
        footer="Location is only used while GEO-CAM is open. Background location is never requested."
      >
        <Row
          label="Permission"
          value={PERMISSION_TEXT[location.permission]}
          description={
            location.permission === 'granted-approximate'
              ? 'Coordinates may be off by several kilometers. Allow precise location for exact coordinates.'
              : undefined
          }
          onPress={() =>
            location.permission === 'granted-approximate' ? requestPreciseLocation() : Linking.openSettings()
          }
          icon="open-outline"
        />
        <ToggleRow
          label="Use cached location"
          description="If there is no live fix, use the last known location. It is always labelled as cached with its age."
          value={loc.allowCachedLocation}
          onChange={(value) => updateSettings('location', { allowCachedLocation: value })}
        />
        <SliderRow
          label="Live fix counts as current for"
          value={loc.currentMaxAgeSec}
          min={5}
          max={120}
          step={5}
          format={(value) => `${value} s`}
          onChange={(value) => updateSettings('location', { currentMaxAgeSec: value })}
        />
        <SliderRow
          label="Maximum age of a cached location"
          value={loc.cachedMaxAgeMin}
          min={1}
          max={240}
          step={1}
          format={(value) => `${value} min`}
          onChange={(value) => updateSettings('location', { cachedMaxAgeMin: value })}
        />
      </Section>

      <Section title="Storage">
        <Row label="Photo library access" value={MEDIA_TEXT[mediaAccess]} onPress={() => Linking.openSettings()} icon="open-outline" />
        <ToggleRow
          label="Also save the unstamped original"
          value={storage.saveOriginal}
          onChange={(value) => updateSettings('storage', { saveOriginal: value })}
        />
        <SliderRow
          label="Photo quality"
          value={storage.photoQuality}
          min={0.6}
          max={1}
          step={0.02}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => updateSettings('storage', { photoQuality: value })}
        />
        <Row
          label="Temporary files"
          value={`${temp.files} · ${formatBytes(temp.bytes)}`}
          description="Working copies kept while photos and videos are processed."
          onPress={() => {
            const removed = cleanTemporaryFiles(5 * 60 * 1000);
            setTemp(temporaryUsage());
            showToast(`Removed ${removed.files} files (${formatBytes(removed.bytes)})`, 'success');
          }}
          icon="trash-outline"
        />
        <Row
          label="Saved map tiles"
          value={`${tiles.files} · ${formatBytes(tiles.bytes)}`}
          description="Maps of places you have been are kept here and keep working offline (up to 150 MB). Downloading whole regions is not offered: OpenStreetMap's rules do not allow bulk downloads."
          onPress={() =>
            Alert.alert('Delete saved map tiles?', 'Maps will be downloaded again when needed and online maps are on.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  clearTileCache();
                  setTiles(tileCacheUsage());
                },
              },
            ])
          }
          icon="trash-outline"
        />
      </Section>

      <Section
        title="Privacy"
        footer="GEO-CAM has no account, no server and no analytics. Photos and videos never leave your device unless you share them."
      >
        <ToggleRow
          label="Strict offline mode"
          description="Blocks all optional network use: no address lookups and no online maps."
          value={privacy.offlineMode}
          onChange={(value) => updateSettings('privacy', { offlineMode: value })}
        />
        <ToggleRow
          label="Online maps (OpenStreetMap)"
          description="Downloads map pictures for your location from tile.openstreetmap.org (coordinates of the map area are sent). Maps already saved keep working offline."
          value={privacy.allowOnlineMaps}
          disabled={privacy.offlineMode}
          onChange={(value) => updateSettings('privacy', { allowOnlineMaps: value, mapPromptShown: true })}
        />
        <ToggleRow
          label="Look up addresses"
          description="Uses the phone's built-in geocoder (Google on Android, Apple on iOS), which sends coordinates over the network."
          value={privacy.allowAddressLookup}
          disabled={privacy.offlineMode}
          onChange={(value) => updateSettings('privacy', { allowAddressLookup: value })}
        />
        <Row
          label="Clear cached addresses"
          value={`${addresses}`}
          onPress={() =>
            Alert.alert('Clear cached addresses?', 'Addresses saved on this device will be removed.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear',
                style: 'destructive',
                onPress: async () => {
                  await clearAddressCache();
                  setAddresses(0);
                  showToast('Cached addresses cleared', 'success');
                },
              },
            ])
          }
          icon="trash-outline"
        />
      </Section>

      <Section title="About">
        <View style={styles.aboutLogo}>
          <BrandLogo variant="full" height={150} />
          <Text style={styles.aboutTagline}>GPS location camera · works offline</Text>
        </View>
        <Row label="App" value="GEO-CAM" />
        <Row label="Version" value={Constants.expoConfig?.version ?? '—'} />
        <Row label="Developer" value="Rakibul Islam" />
        <Row label="Powered by" value="8BITBANNAR" />
        <Row
          label="Video stamping engine"
          value={isVideoStampingAvailable() ? 'Available' : 'Not in this build'}
        />
        <Row
          label="Open-source licenses"
          description="Map data © OpenStreetMap contributors (ODbL), tiles from tile.openstreetmap.org. Inter font (SIL Open Font License 1.1), React Native, Expo, React Native Skia (MIT), Media3 (Apache 2.0). Full texts are listed in the project's THIRD_PARTY_NOTICES file."
        />
        <Row
          label="Reset all settings"
          destructive
          onPress={() =>
            Alert.alert('Reset settings?', 'All settings return to their defaults.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => resetSettings() },
            ])
          }
        />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  aboutLogo: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  aboutTagline: { color: colors.silver, fontSize: 13, marginTop: spacing.xs },
});
