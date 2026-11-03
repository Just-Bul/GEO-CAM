import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { LocationStampPreview } from '../components/LocationStampPreview';
import { ChoiceRow, Section, settingsStyles, SliderRow, TextRow, ToggleRow } from '../components/SettingsUI';
import { addressStore } from '../features/location/addressResolver';
import { deviceTimeZone, freezeCaptureLocation } from '../features/location/captureLocation';
import { locationStore } from '../features/location/locationService';
import { mapNetworkAllowed, useMiniMap } from '../features/maps/mapService';
import { updateSettings, useSettings } from '../features/settings/settingsService';
import { useStampFonts, useStampLogo } from '../features/stamping/stampFonts';
import { buildStampContent, stampStyleFrom } from '../features/stamping/stampTemplates';
import { useNow } from '../hooks/useNow';
import type { StampPosition, StampSettings } from '../types/settings';
import { colors, radii, spacing } from '../theme';
import { useStore } from '../utils/store';

const COLORS = [
  { value: '#FFFFFF', label: 'White' },
  { value: '#FFE45C', label: 'Yellow' },
  { value: '#8FD3FF', label: 'Light blue' },
  { value: '#7CF29A', label: 'Green' },
  { value: '#FFB27A', label: 'Orange' },
];

export default function StampSettingsScreen() {
  const settings = useSettings();
  const stamp = settings.stamp;
  const fonts = useStampFonts();
  const logo = useStampLogo();
  const now = useNow(1000);
  const { width } = useWindowDimensions();
  const reading = useStore(locationStore).reading;
  const address = useStore(addressStore).address;

  const previewWidth = Math.min(width - spacing.lg * 2, 420);
  const previewHeight = previewWidth * (4 / 3);
  const content = useMemo(
    () => buildStampContent(freezeCaptureLocation(settings.location, now), new Date(now), stamp, deviceTimeZone()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, stamp, settings.location, reading, address],
  );
  const style = useMemo(() => stampStyleFrom(stamp), [stamp]);
  // Mini map for the exact coordinates shown in the stamp (none when location is unavailable).
  const previewLocation = freezeCaptureLocation(settings.location, now);
  const mapLat = previewLocation.reading?.latitude ?? null;
  const mapLon = previewLocation.reading?.longitude ?? null;
  const mapCoords = useMemo(
    () => (mapLat != null && mapLon != null ? { latitude: mapLat, longitude: mapLon } : null),
    [mapLat, mapLon],
  );
  const miniMap = useMiniMap(mapCoords, stamp.enabled && stamp.showMap, mapNetworkAllowed(settings));

  const set = (patch: Partial<StampSettings>) => updateSettings('stamp', patch);

  return (
    <ScrollView style={settingsStyles.screen} contentContainerStyle={settingsStyles.content}>
      <View style={[styles.preview, { width: previewWidth, height: previewHeight }]}>
        <Text style={[styles.previewLabel, stamp.position.startsWith('top') ? { bottom: spacing.md } : { top: spacing.md }]}>
          Preview with your current location
        </Text>
        {fonts && stamp.enabled ? (
          <LocationStampPreview
            width={previewWidth}
            height={previewHeight}
            fonts={fonts}
            content={content}
            style={style}
            mapImage={miniMap.image}
            logoImage={logo}
          />
        ) : null}
      </View>

      <Section title="Stamp">
        <ToggleRow label="Add location stamp to photos and videos" value={stamp.enabled} onChange={(enabled) => set({ enabled })} />
      </Section>

      <Section title="Information" footer="If an address is not available, coordinates are shown instead. Nothing is ever guessed.">
        <ToggleRow label="Location name" value={stamp.showLocationName} onChange={(v) => set({ showLocationName: v })} />
        <ToggleRow label="Full address" value={stamp.showAddress} onChange={(v) => set({ showAddress: v })} />
        <ToggleRow label="Coordinates" value={stamp.showCoordinates} onChange={(v) => set({ showCoordinates: v })} />
        <ChoiceRow
          label="Coordinate format"
          options={[
            { value: 'decimal', label: '23.780573°' },
            { value: 'dms', label: `23°46'50.1"N` },
          ]}
          value={stamp.coordinateFormat}
          onChange={(v) => set({ coordinateFormat: v })}
        />
        <ToggleRow label="Date" value={stamp.showDate} onChange={(v) => set({ showDate: v })} />
        <ToggleRow label="Time" value={stamp.showTime} onChange={(v) => set({ showTime: v })} />
        <ToggleRow label="24-hour time" value={stamp.use24HourTime} onChange={(v) => set({ use24HourTime: v })} />
        <ToggleRow label="Time zone" value={stamp.showTimezone} onChange={(v) => set({ showTimezone: v })} />
        <ToggleRow label="GPS accuracy" value={stamp.showAccuracy} onChange={(v) => set({ showAccuracy: v })} />
        <ToggleRow label="Altitude" value={stamp.showAltitude} onChange={(v) => set({ showAltitude: v })} />
        <ToggleRow
          label="Compass heading"
          description="Uses the compass sensor. Hidden when the compass is not calibrated."
          value={stamp.showCompass}
          onChange={(v) => set({ showCompass: v })}
        />
        <ToggleRow label="Country flag" value={stamp.showFlag} onChange={(v) => set({ showFlag: v })} />
        <ToggleRow
          label="Map"
          description={
            settings.privacy.allowOnlineMaps && !settings.privacy.offlineMode
              ? 'OpenStreetMap street map of the exact spot. Places you have been work offline.'
              : 'Online maps are off (Settings → Privacy). Saved maps are still used; otherwise a "Map unavailable" card is shown.'
          }
          value={stamp.showMap}
          onChange={(v) => set({ showMap: v })}
        />
      </Section>

      <Section title="Text">
        <ToggleRow
          label="GEO-CAM logo on stamp"
          description="Small logo badge above the stamp. Shows your watermark text next to it, or GEO-CAM."
          value={stamp.showLogo}
          onChange={(v) => set({ showLogo: v })}
        />
        <TextRow label="Watermark" value={stamp.watermark} placeholder="e.g. company or project name" maxLength={60} onChange={(v) => set({ watermark: v })} />
        <TextRow label="Note" value={stamp.note} placeholder="e.g. site or inspection number" maxLength={120} onChange={(v) => set({ note: v })} />
      </Section>

      <Section title="Appearance">
        <ChoiceRow<StampPosition>
          label="Position"
          options={[
            { value: 'bottom-left', label: 'Bottom left' },
            { value: 'bottom-right', label: 'Bottom right' },
            { value: 'top-left', label: 'Top left' },
            { value: 'top-right', label: 'Top right' },
          ]}
          value={stamp.position}
          onChange={(v) => set({ position: v })}
        />
        <SliderRow label="Stamp size" value={stamp.size} min={0.7} max={1.4} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ size: v })} />
        <SliderRow label="Text size" value={stamp.textSize} min={0.8} max={1.4} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ textSize: v })} />
        <SliderRow
          label="Background opacity"
          value={stamp.backgroundOpacity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set({ backgroundOpacity: v })}
        />
        <ChoiceRow label="Text color" options={COLORS} value={stamp.textColor} onChange={(v) => set({ textColor: v })} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignSelf: 'center',
    marginBottom: spacing.xl,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#3A4A5C',
  },
  previewLabel: {
    position: 'absolute',
    left: spacing.md,
    color: colors.textMuted,
    fontSize: 12,
  },
});
