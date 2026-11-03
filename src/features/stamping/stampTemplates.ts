import type { StampSettings } from '../../types/settings';
import {
  countryFlag,
  formatAccuracy,
  formatAge,
  formatAltitude,
  formatHeading,
  formatLatitude,
  formatLongitude,
  formatStampDate,
  formatStampTime,
  formatUtcOffset,
} from '../../utils/format';
import { addressLine, addressTitle } from '../location/addressFormat';
import type { CaptureLocation } from '../location/locationTypes';

export type StampStatusKind = 'current' | 'cached' | 'unavailable' | 'mocked';

/** Everything the stamp shows, already formatted. Built once per capture (or per preview tick). */
export interface StampContent {
  title: string | null;
  flag: string | null;
  address: string | null;
  coordinates: string | null;
  /** Date / time / timezone line. */
  dateTime: string | null;
  /** Secondary facts such as accuracy, altitude and heading. */
  details: string[];
  status: { kind: StampStatusKind; label: string | null };
  watermark: string | null;
  note: string | null;
}

export interface StampStyle {
  position: StampSettings['position'];
  size: number;
  textSize: number;
  backgroundOpacity: number;
  textColor: string;
  showMap: boolean;
  showLogo: boolean;
}

export function stampStyleFrom(settings: StampSettings): StampStyle {
  return {
    position: settings.position,
    size: settings.size,
    textSize: settings.textSize,
    backgroundOpacity: settings.backgroundOpacity,
    textColor: settings.textColor,
    showMap: settings.showMap,
    showLogo: settings.showLogo,
  };
}

/**
 * Builds stamp text from the location frozen at capture time.
 * Unavailable information is left out (or labelled) — it is never filled with guesses.
 */
export function buildStampContent(
  location: CaptureLocation,
  capturedAt: Date,
  settings: StampSettings,
  timeZoneName: string | null,
): StampContent {
  const { reading, address, freshness } = location;
  const usable = freshness !== 'unavailable' && reading != null;

  let status: StampContent['status'];
  if (!usable) {
    status = { kind: 'unavailable', label: 'Location unavailable' };
  } else if (reading.mocked) {
    status = { kind: 'mocked', label: 'Mock location provider' };
  } else if (freshness === 'cached') {
    status = {
      kind: 'cached',
      label: `Cached location · ${formatAge(location.ageMs ?? 0)} old`,
    };
  } else {
    status = { kind: 'current', label: null };
  }

  const title = usable && address && settings.showLocationName ? addressTitle(address) : null;
  const fullAddress = usable && address && settings.showAddress ? addressLine(address) : null;

  // When the user wants an address but none is available, coordinates stand in for it.
  const addressWantedButMissing =
    (settings.showAddress || settings.showLocationName) && !title && !fullAddress;
  const coordinates =
    usable && (settings.showCoordinates || addressWantedButMissing)
      ? `Lat ${formatLatitude(reading.latitude, settings.coordinateFormat)}  Long ${formatLongitude(
          reading.longitude,
          settings.coordinateFormat,
        )}`
      : null;

  const dateParts: string[] = [];
  if (settings.showDate) dateParts.push(formatStampDate(capturedAt));
  if (settings.showTime) dateParts.push(formatStampTime(capturedAt, settings.use24HourTime));
  if (settings.showTimezone) dateParts.push(formatUtcOffset(capturedAt));

  // Non-breaking spaces keep each label with its value when the line wraps.
  const NBSP = ' ';
  const details: string[] = [];
  if (settings.showTimezone && timeZoneName) details.push(timeZoneName);
  if (usable && settings.showAccuracy) {
    const accuracy = formatAccuracy(reading.accuracy);
    details.push(accuracy ? `Accuracy${NBSP}${accuracy}` : 'Accuracy not reported');
  }
  if (usable && settings.showAltitude) {
    const altitude = formatAltitude(reading.altitude);
    if (altitude) details.push(`Altitude${NBSP}${altitude}`);
  }
  if (settings.showCompass) {
    const heading = formatHeading(location.heading);
    if (heading) details.push(`Heading${NBSP}${heading}`);
  }

  const watermark = settings.watermark.trim() || null;
  const note = settings.note.trim() || null;

  return {
    title,
    flag: usable && settings.showFlag && address ? countryFlag(address.isoCountryCode) : null,
    address: fullAddress,
    coordinates,
    dateTime: dateParts.length ? dateParts.join('  ') : null,
    details,
    status,
    watermark,
    note,
  };
}
