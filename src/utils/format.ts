import type { CoordinateFormat } from '../types/settings';

const pad = (value: number, length = 2) => String(Math.trunc(Math.abs(value))).padStart(length, '0');

function toDms(value: number, positive: string, negative: string): string {
  const hemisphere = value >= 0 ? positive : negative;
  const absolute = Math.abs(value);
  let degrees = Math.floor(absolute);
  let minutes = Math.floor((absolute - degrees) * 60);
  let seconds = Math.round(((absolute - degrees) * 60 - minutes) * 60 * 10) / 10;
  if (seconds >= 60) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes = 0;
    degrees += 1;
  }
  return `${degrees}°${pad(minutes)}'${seconds.toFixed(1).padStart(4, '0')}"${hemisphere}`;
}

export function formatLatitude(latitude: number, format: CoordinateFormat): string {
  return format === 'dms' ? toDms(latitude, 'N', 'S') : `${latitude.toFixed(6)}°`;
}

export function formatLongitude(longitude: number, format: CoordinateFormat): string {
  return format === 'dms' ? toDms(longitude, 'E', 'W') : `${longitude.toFixed(6)}°`;
}

/**
 * Accuracy is rounded *up* so the displayed value is never better than what
 * the operating system reported.
 */
export function formatAccuracy(accuracy: number | null | undefined): string | null {
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy < 0) return null;
  if (accuracy >= 1000) return `±${(Math.ceil(accuracy / 100) / 10).toFixed(1)} km`;
  return `±${Math.max(1, Math.ceil(accuracy))} m`;
}

export function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export function formatAltitude(altitude: number | null | undefined): string | null {
  if (altitude == null || !Number.isFinite(altitude)) return null;
  return `${Math.round(altitude)} m`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Locale-independent so the stamp looks identical on every device. Example: "Fri, 10 Oct 2026". */
export function formatStampDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Example: "02:05:09 PM" or "14:05:09". */
export function formatStampTime(date: Date, use24Hour: boolean): string {
  const hours = date.getHours();
  const tail = `${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  if (use24Hour) return `${pad(hours)}:${tail}`;
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(twelve)}:${tail} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** Example: "GMT +06:00". Derived from the device clock at the given instant. */
export function formatUtcOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return `GMT ${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/** Example: "+06:00", the form EXIF OffsetTime fields use. */
export function formatExifOffset(date: Date): string {
  return formatUtcOffset(date).replace('GMT ', '');
}

/** GEO_YYYYMMDD_HHMMSS[suffix].ext using local capture time. */
export function captureFileName(date: Date, extension: 'jpg' | 'mp4', suffix = ''): string {
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `GEO_${stamp}${suffix}.${extension}`;
}

/** Converts an ISO 3166 alpha-2 country code into its flag emoji, or null for invalid codes. */
export function countryFlag(isoCountryCode: string | null | undefined): string | null {
  if (!isoCountryCode || !/^[A-Za-z]{2}$/.test(isoCountryCode)) return null;
  const base = 0x1f1e6;
  const upper = isoCountryCode.toUpperCase();
  return String.fromCodePoint(base + upper.charCodeAt(0) - 65, base + upper.charCodeAt(1) - 65);
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function formatHeading(heading: number | null | undefined): string | null {
  if (heading == null || !Number.isFinite(heading) || heading < 0) return null;
  const normalized = ((heading % 360) + 360) % 360;
  const point = COMPASS_POINTS[Math.round(normalized / 45) % 8];
  return `${Math.round(normalized)}° ${point}`;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}
