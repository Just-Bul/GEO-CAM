/**
 * Minimal EXIF (APP1) writer for the stamped JPEGs.
 *
 * Skia's JPEG encoder writes no metadata, so after stamping we insert a small
 * EXIF block with the capture time and — only when a usable reading exists —
 * GPS coordinates. Pixels are already upright, so Orientation is always 1.
 */

export interface ExifInput {
  capturedAt: Date;
  /** "+06:00" style offset of the device clock at capture time. */
  utcOffset: string;
  width: number;
  height: number;
  software: string;
  gps: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    /** Horizontal accuracy in meters (GPSHPositioningError). */
    accuracy: number | null;
    /** Epoch ms of the GPS fix. */
    timestamp: number;
    /** Direction the camera faced, degrees. */
    heading: number | null;
  } | null;
}

const TYPE_BYTE = 1;
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TYPE_UNDEFINED = 7;

const TYPE_SIZES: Record<number, number> = {
  [TYPE_BYTE]: 1,
  [TYPE_ASCII]: 1,
  [TYPE_SHORT]: 2,
  [TYPE_LONG]: 4,
  [TYPE_RATIONAL]: 8,
  [TYPE_UNDEFINED]: 1,
};

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** Encoded value bytes (big-endian). */
  bytes: number[];
}

const u16 = (v: number) => [(v >>> 8) & 0xff, v & 0xff];
const u32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];

function ascii(tag: number, text: string): Entry {
  const bytes = [...text].map((c) => c.charCodeAt(0) & 0x7f).concat(0);
  return { tag, type: TYPE_ASCII, count: bytes.length, bytes };
}

function short(tag: number, value: number): Entry {
  return { tag, type: TYPE_SHORT, count: 1, bytes: u16(value) };
}

function long(tag: number, value: number): Entry {
  return { tag, type: TYPE_LONG, count: 1, bytes: u32(value) };
}

function rationals(tag: number, values: [number, number][]): Entry {
  return {
    tag,
    type: TYPE_RATIONAL,
    count: values.length,
    bytes: values.flatMap(([n, d]) => [...u32(n), ...u32(d)]),
  };
}

function byteEntry(tag: number, values: number[], type = TYPE_BYTE): Entry {
  return { tag, type, count: values.length, bytes: values };
}

/** Degrees → [deg, min, sec] rationals, seconds with 1/10000 precision (~3 mm). */
function dmsRationals(value: number): [number, number][] {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60 * 10000);
  return [
    [degrees, 1],
    [minutes, 1],
    [seconds, 10000],
  ];
}

const pad = (v: number, n = 2) => String(v).padStart(n, '0');

function exifDateTime(date: Date) {
  return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Serialises one IFD at `offset` (relative to the TIFF header).
 * Returns the bytes and a function to patch LONG pointer values later.
 */
function buildIfd(entries: Entry[], offset: number): number[] {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const headerSize = 2 + sorted.length * 12 + 4;
  let dataOffset = offset + headerSize;
  const table: number[] = [...u16(sorted.length)];
  const data: number[] = [];
  for (const entry of sorted) {
    const size = TYPE_SIZES[entry.type] * entry.count;
    table.push(...u16(entry.tag), ...u16(entry.type), ...u32(entry.count));
    if (size <= 4) {
      const inline = entry.bytes.slice(0, 4);
      while (inline.length < 4) inline.push(0);
      table.push(...inline);
    } else {
      table.push(...u32(dataOffset));
      data.push(...entry.bytes);
      if (entry.bytes.length % 2) data.push(0); // keep word alignment
      dataOffset += entry.bytes.length + (entry.bytes.length % 2);
    }
  }
  table.push(...u32(0)); // no next IFD
  return [...table, ...data];
}

function ifdSize(entries: Entry[]): number {
  return buildIfd(entries, 0).length;
}

export function buildExifSegment(input: ExifInput): Uint8Array {
  const dateTime = exifDateTime(input.capturedAt);

  const exifEntries: Entry[] = [
    byteEntry(0x9000, [0x30, 0x32, 0x33, 0x32], TYPE_UNDEFINED), // ExifVersion "0232"
    ascii(0x9003, dateTime), // DateTimeOriginal
    ascii(0x9004, dateTime), // DateTimeDigitized
    ascii(0x9010, input.utcOffset), // OffsetTime
    ascii(0x9011, input.utcOffset), // OffsetTimeOriginal
    ascii(0x9012, input.utcOffset), // OffsetTimeDigitized
    long(0xa002, input.width), // PixelXDimension
    long(0xa003, input.height), // PixelYDimension
  ];

  let gpsEntries: Entry[] | null = null;
  if (input.gps) {
    const { latitude, longitude, altitude, accuracy, timestamp, heading } = input.gps;
    const fix = new Date(timestamp);
    gpsEntries = [
      byteEntry(0x0000, [2, 3, 0, 0]), // GPSVersionID
      ascii(0x0001, latitude >= 0 ? 'N' : 'S'),
      rationals(0x0002, dmsRationals(latitude)),
      ascii(0x0003, longitude >= 0 ? 'E' : 'W'),
      rationals(0x0004, dmsRationals(longitude)),
      rationals(0x0007, [
        [fix.getUTCHours(), 1],
        [fix.getUTCMinutes(), 1],
        [fix.getUTCSeconds(), 1],
      ]),
      ascii(0x001d, `${fix.getUTCFullYear()}:${pad(fix.getUTCMonth() + 1)}:${pad(fix.getUTCDate())}`),
    ];
    if (altitude != null && Number.isFinite(altitude)) {
      gpsEntries.push(byteEntry(0x0005, [altitude < 0 ? 1 : 0]));
      gpsEntries.push(rationals(0x0006, [[Math.round(Math.abs(altitude) * 100), 100]]));
    }
    if (heading != null && Number.isFinite(heading) && heading >= 0) {
      gpsEntries.push(ascii(0x0010, 'T'));
      gpsEntries.push(rationals(0x0011, [[Math.round((heading % 360) * 100), 100]]));
    }
    if (accuracy != null && Number.isFinite(accuracy) && accuracy >= 0) {
      // Rounded up so the metadata never claims better precision than the OS reported.
      gpsEntries.push(rationals(0x001f, [[Math.ceil(accuracy * 100), 100]]));
    }
  }

  const ifd0Base: Entry[] = [
    short(0x0112, 1), // Orientation: top-left (pixels are already upright)
    ascii(0x0131, input.software),
    ascii(0x0132, dateTime),
    long(0x8769, 0), // Exif IFD pointer, patched below
  ];
  if (gpsEntries) ifd0Base.push(long(0x8825, 0)); // GPS IFD pointer

  const ifd0Offset = 8;
  const exifOffset = ifd0Offset + ifdSize(ifd0Base);
  const gpsOffset = exifOffset + ifdSize(exifEntries);

  const ifd0 = ifd0Base.map((entry) => {
    if (entry.tag === 0x8769) return long(0x8769, exifOffset);
    if (entry.tag === 0x8825) return long(0x8825, gpsOffset);
    return entry;
  });

  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, ...u32(ifd0Offset), // "MM", 42, offset of IFD0
    ...buildIfd(ifd0, ifd0Offset),
    ...buildIfd(exifEntries, exifOffset),
    ...(gpsEntries ? buildIfd(gpsEntries, gpsOffset) : []),
  ];

  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0"
  const length = payload.length + 2;
  if (length > 0xffff) throw new Error('EXIF segment too large');
  return Uint8Array.from([0xff, 0xe1, ...u16(length), ...payload]);
}

/**
 * Returns a new JPEG with the EXIF segment inserted (after JFIF APP0 if present).
 * Any existing EXIF APP1 segment is replaced.
 */
export function insertExif(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error('Not a JPEG file');
  }
  const kept: Uint8Array[] = [];
  let position = 2;
  let sawApp0 = false;
  // Walk the header segments until the first non-APPn marker.
  while (position + 4 <= jpeg.length && jpeg[position] === 0xff) {
    const marker = jpeg[position + 1];
    if (marker < 0xe0 || marker > 0xef) break;
    const length = (jpeg[position + 2] << 8) | jpeg[position + 3];
    const end = position + 2 + length;
    if (end > jpeg.length) break;
    const isExif =
      marker === 0xe1 &&
      jpeg[position + 4] === 0x45 &&
      jpeg[position + 5] === 0x78 &&
      jpeg[position + 6] === 0x69 &&
      jpeg[position + 7] === 0x66;
    if (marker === 0xe0 && position === 2) sawApp0 = true;
    if (!isExif) kept.push(jpeg.subarray(position, end));
    position = end;
  }
  const head = jpeg.subarray(0, 2);
  const rest = jpeg.subarray(position);
  const app0 = sawApp0 ? kept.shift() : undefined;
  const parts = [head, ...(app0 ? [app0] : []), segment, ...kept, rest];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
