# Geo Camera — Privacy

Geo Camera (GEO-CAM) is designed to work without accounts, servers or tracking.
This document describes exactly what the app does with your data.

## What stays on your device

| Data | Where it is kept | Leaves the device? |
| --- | --- | --- |
| Photos and videos | System photo library (Android MediaStore / iOS Photos), album "Geo Camera" | Only if you share them |
| Unfinished work (processing copies, stamp overlay images) | App cache folder (`cache/geocam/processing`) | Never; deleted after processing, leftovers older than 1 hour are removed at launch |
| Capture records (time, coordinates, accuracy, address text) | App storage (AsyncStorage) | Never. Android backup is disabled (`allowBackup=false`) so these are not copied to cloud backup |
| Resolved addresses cache | App storage (AsyncStorage) | Never. Can be cleared in Settings → Privacy |
| Settings | App storage (AsyncStorage) | Never |

There is **no** app backend, remote database, analytics SDK, advertising SDK,
crash-reporting service or automatic upload of any kind.

## Network use

The app works fully offline: camera, GPS, stamping, saving and the gallery need
no connection. Two optional features can use the network:

1. **Address lookup** (on by default, can be turned off). The app calls the
   operating system's geocoder (`Location.reverseGeocodeAsync`):
   - Android: `android.location.Geocoder`, usually backed by Google Play services.
   - iOS: Apple's `CLGeocoder`.

   The **coordinates** are sent to Google or Apple by the operating system to
   get an address back. Results are cached on the device to reduce requests.
   No API key is embedded in the app.
2. **Online maps** (off until you agree — the app asks once, or Settings → Privacy).
   Map pictures come from OpenStreetMap's tile server (`tile.openstreetmap.org`).
   The server learns which ~550 m map area was requested (and your IP address),
   which reveals your approximate location. Downloaded tiles are kept on the device
   (up to 150 MB, deletable in Settings → Storage) so places you have been work offline.

**Strict offline mode** (Settings → Privacy) blocks both: no geocoding or map
requests are made; only previously cached addresses and map tiles are used.

## Location

- Only *foreground* location is used, and only while the camera screen is open.
  Background location is never requested; `ACCESS_BACKGROUND_LOCATION` and
  `FOREGROUND_SERVICE_LOCATION` are explicitly removed from the Android build.
- Approximate (coarse / reduced accuracy) permission is supported. The app then
  shows the real, larger accuracy radius and labels the location "Approx.".
- Coordinates are never invented. Without a usable fix the stamp says
  "Location unavailable"; cached readings are labelled with their age; readings
  Android reports as coming from a mock provider are labelled as such.

## Metadata in saved files

Stamped photos contain EXIF metadata written by the app: capture date/time with
UTC offset, and — only when a usable location existed — GPS latitude, longitude,
altitude, horizontal accuracy and (if enabled) compass direction. Anyone you
share the original file with can read this. Many messaging and social apps strip
or rewrite metadata, so the visible stamp is the primary location record.

## Permissions

| Permission | Why | When requested |
| --- | --- | --- |
| Camera | Take photos and videos | First launch |
| Location (while in use) | Coordinates for the stamp | When the camera opens |
| Microphone | Sound in videos (optional) | When switching to video with sound on |
| Photos / media library | Save captures and show them in the gallery | First save or gallery visit |

Every feature keeps working (with reduced information) if a permission is denied.
