"""Independent check of the EXIF written by src/features/media/exifWriter.ts.

Run `npm test` first (it writes tests/output/exif-sample.jpg), then:
    python tests/verify_exif.py
Requires Pillow.
"""
import os
import sys

from PIL import Image
from PIL.ExifTags import GPS, IFD, Base

HERE = os.path.dirname(os.path.abspath(__file__))


def dms_to_deg(values, ref):
    deg = float(values[0]) + float(values[1]) / 60 + float(values[2]) / 3600
    return -deg if ref in ("S", "W") else deg


def main():
    path = os.path.join(HERE, "output", "exif-sample.jpg")
    image = Image.open(path)
    image.load()
    exif = image.getexif()
    assert exif.get(Base.Orientation) == 1, exif.get(Base.Orientation)
    assert exif.get(Base.Software) == "Geo Camera 1.0.0"
    assert exif.get(Base.DateTime) == "2026:10:10 14:05:09"

    sub = exif.get_ifd(IFD.Exif)
    assert sub.get(Base.DateTimeOriginal) == "2026:10:10 14:05:09", sub
    assert sub.get(Base.OffsetTimeOriginal) == "+06:00", sub
    assert sub.get(Base.ExifImageWidth) == 640

    gps = exif.get_ifd(IFD.GPSInfo)
    lat = dms_to_deg(gps[GPS.GPSLatitude], gps[GPS.GPSLatitudeRef])
    lon = dms_to_deg(gps[GPS.GPSLongitude], gps[GPS.GPSLongitudeRef])
    assert abs(lat - 23.780573) < 1e-6, lat
    assert abs(lon - -90.407015) < 1e-6, lon
    assert gps[GPS.GPSAltitudeRef] in (1, b"\x01"), gps[GPS.GPSAltitudeRef]
    assert abs(float(gps[GPS.GPSAltitude]) - 12.34) < 1e-6
    assert gps[GPS.GPSDateStamp] == "2026:10:10"
    assert [float(v) for v in gps[GPS.GPSTimeStamp]] == [8.0, 5.0, 9.0]
    assert abs(float(gps[GPS.GPSHPositioningError]) - 7.01) < 1e-6
    assert abs(float(gps[GPS.GPSImgDirection]) - 212.5) < 1e-6

    no_gps = Image.open(os.path.join(HERE, "output", "exif-no-gps.jpg")).getexif()
    assert IFD.GPSInfo not in no_gps, "GPS IFD must be absent without a location"
    print("EXIF OK:", round(lat, 6), round(lon, 6), image.size)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        print("EXIF verification FAILED:", error)
        sys.exit(1)
