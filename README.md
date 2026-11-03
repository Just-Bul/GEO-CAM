# GEO-CAM

A cross-platform (Android + iOS) GPS camera built with **React Native, Expo SDK 57
and TypeScript**. It captures photos and videos and permanently burns a location
stamp (place name, address, coordinates, date, time, time zone, accuracy and a
map area) into the saved media, then saves it to the phone's Gallery / Photos.

No login · no backend · no cloud · works offline.

*Powered by 8BITBANNAR — developer: Rakibul Islam.*

---

## Status

Statuses use three levels and only claim what was actually done:

- **Tested** — implemented and verified (unit tests, headless rendering, or on the Android emulator, as stated).
- **Implemented, not tested** — the code exists and compiles where it could be compiled, but has not been run.
- **Planned** — not implemented yet.

See [`TESTING.md`](TESTING.md) for the full checklist with evidence.

| Area | Android (emulator) | iOS |
| --- | --- | --- |
| Camera preview, photo capture, front/rear, zoom, flash/torch UI | Tested ⚠️ emulator stills are black (emulator camera limitation) — needs a phone | Implemented, not tested |
| Resolution (fixed defaults: highest 4:3 photo size the camera reports, 1080p video) | Tested | Implemented, not tested |
| Photo stamp renderer (Skia) | Tested (headless, 6 layouts) | same shared code |
| Video recording, timer, microphone on/off button (camera top bar, video mode) | Tested | Implemented, not tested |
| GPS (live / cached / unavailable, accuracy, re-ask after denial) | Tested | Implemented, not tested |
| Address lookup (OS geocoder + local cache + strict offline) | Tested | Implemented, not tested |
| Photo stamping at full resolution + EXIF GPS | Tested (stamp pixels + EXIF verified) | Implemented, not tested |
| Video stamping, fixed + dynamic, cancel, progress | Tested (frames, audio track, durations verified) | Implemented, **not compiled** (no Mac here) |
| Save to Gallery (`Pictures/Geo Camera`, `Movies/Geo Camera`) | Tested | Implemented, not tested |
| Recovery of captures interrupted by a crash/kill | Tested | Implemented, not tested |
| In-app gallery: multi-select (long-press / Select) → share several or delete; viewer with share button | Tested (Android share sheet with 2 images) | Implemented, not tested |
| Settings (persisted locally) | Tested | Implemented, not tested |
| Offline capture (airplane mode + strict offline mode) | Tested | Implemented, not tested |
| Mini map in the stamp (OpenStreetMap, exact-centre pin, attribution) | Tested (live preview, saved photo, offline reuse) | Implemented, not tested |
| Offline maps | Tested: maps of places already viewed work offline (saved tiles, up to 150 MB). **Region downloads are not offered** — OpenStreetMap's tile policy forbids them | same |
| Physical-device testing | **Not done yet** | **Not done yet** |

---

## How it works

```
Camera (expo-camera) ──► original JPEG / MP4 in app cache
                               │
Location (expo-location) ──► reading frozen at capture (live / cached / unavailable)
Address (OS geocoder, cached) ─┘
                               ▼
        Stamp renderer (Skia, shared by preview, photo and video)
                               │
        ┌──────────────────────┴──────────────────────┐
  Photo: Skia composites at full resolution     Video: stamp PNG(s) rendered in JS,
  → JPEG + EXIF (GPS, time, offset)             composited natively:
                                                 Android Media3 Transformer
                                                 iOS AVFoundation custom compositor
        └──────────────────────┬──────────────────────┘
                               ▼
     Validate output → save to Gallery/Photos → local capture record → delete temp files
```

Key rules the code enforces:

- The preview overlay is **not** what gets saved: the stamp is re-rendered at
  full resolution and composited into the pixels (photos) or frames (videos).
- Coordinates and addresses are never invented. No fix → "Location unavailable".
  Cached readings are labelled with their age. Mock providers are labelled.
- Accuracy is rounded **up**, never shown better than the OS reported.
- The camera's original file is only deleted after the final file was written,
  validated and saved. If stamping fails, the original is saved and the user is told.

### Project layout

```
GeoCamera/
├─ src/app/                    Expo Router screens
│  ├─ _layout.tsx              root: settings/fonts load, navigation, toasts
│  ├─ index.tsx                camera permission gate → /camera
│  ├─ camera.tsx               main camera screen
│  ├─ gallery.tsx              grid of captures
│  ├─ media-preview.tsx        viewer, video player, details, share, delete
│  ├─ settings.tsx             all settings
│  └─ stamp-settings.tsx       stamp fields/appearance with live preview
├─ src/components/             CameraPreview, CameraControls, LocationStampPreview,
│                              LocationStatus, CaptureThumbnail, SettingsUI, Toast
├─ src/features/
│  ├─ camera/                  cameraService (picture sizes), photoCapture, videoCapture,
│  │                           useCaptureController
│  ├─ location/                locationService, addressResolver, freshness, types
│  ├─ stamping/                stampTemplates, stampRenderer, stampFonts,
│  │                           photoStampProcessor, videoStampProcessor, dynamicLocation
│  ├─ media/                   mediaLibraryService, exifWriter, temporaryFileService,
│  │                           recoveryService (crash-safe originals)
│  ├─ gallery/                 mediaRepository, galleryService
│  └─ settings/                settingsDefaults, settingsService
├─ modules/video-stamping/     local Expo native module (Kotlin + Swift), see its README
├─ tests/                      Node tests (logic, EXIF, headless Skia rendering)
├─ assets/fonts/               Inter (OFL) used for the stamp
├─ app.json · eas.json · PRIVACY.md · TESTING.md · THIRD_PARTY_NOTICES.md
```

`android/` and `ios/` are generated by `npx expo prebuild` (Continuous Native
Generation) and are not edited by hand.

### Library choices (all checked against Expo SDK 57, October 2026)

| Need | Choice | Why |
| --- | --- | --- |
| Camera | `expo-camera` 57 (`CameraView`) | Required by the brief; CameraX / AVFoundation underneath |
| Location & geocoding | `expo-location` 57 | Foreground only; reports precise vs approximate permission |
| Media library | `expo-media-library` 57 (new `Asset`/`Album` API) | MediaStore / PhotoKit |
| Image compositing | `@shopify/react-native-skia` 2.6 | Full-resolution offscreen drawing, text layout with wrapping and system font fallback, runs headless for tests |
| Video compositing | Local Expo module: **Media3 Transformer 1.9.0** (Android), **AVFoundation** (iOS) | No maintained cross-platform package burns arbitrary overlays into video; Media3 pinned to the same version as `expo-video` |
| Settings | AsyncStorage | Small key-value data |
| Files | `expo-file-system` 57 (`File`/`Directory`/`Paths`) | Temp files, free space |

---

## Development setup (Windows)

Requirements found on the development PC: Node 24, npm 11, Android SDK
(platforms 34/36), Android Studio's bundled **JDK 21** (`C:\Program Files\Android\Android Studio\jbr`),
EAS CLI. The system JDK 11 is too old for React Native 0.86 — point `JAVA_HOME` at the JBR.

```powershell
cd "D:\PROJECTS\GEO CAMERA\GeoCamera"
npm install
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"

npm run typecheck      # tsc --noEmit
npm run lint           # expo lint
npm test               # logic, EXIF and headless stamp-rendering tests
python tests\verify_exif.py   # independent EXIF check with Pillow (after npm test)
```

Rendered stamp samples from the tests are written to `tests/output/`.

### Run on an Android emulator or phone (development build)

Expo Go **cannot** run this app (it contains a custom native module).

```powershell
npx expo prebuild --platform android --clean
npx expo run:android            # builds, installs and starts Metro
```

For a physical phone: enable USB debugging and connect it; `npx expo run:android`
picks it up. Set an emulator location with `adb emu geo fix <longitude> <latitude>`.

### Troubleshooting local Android builds (Windows)

- **"The paging file is too small" / clang crashes**: the first build compiles a lot
  of C++. On an 8 GB PC close the emulator and other heavy apps, and limit workers:
  `cd android; .\gradlew assembleDebug --max-workers=2 -PreactNativeArchitectures=x86_64`
  (use `arm64-v8a` for a phone). Start the emulator after the build.
- **Gradle download timeouts** (`Connect timed out` for `gradle-9.3.1-bin.zip` or Maven):
  set `$env:JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true"` before running Gradle.
- **"…libworklets.so missing and no known rule to make it"** after changing native
  packages: delete `node_modules/<package>/android/.cxx` and `.../android/build`
  for expo-modules-core, react-native-worklets and react-native-reanimated, then rebuild.
- **`EBUSY: resource busy or locked, rmdir '...\android'`** during `expo prebuild --clean`:
  the adb server (or an emulator) started from inside `android/` keeps the folder open.
  Run `adb kill-server`, close the emulator, then retry.
- Do not upgrade `react-native-reanimated` / `react-native-worklets` past the versions
  `npx expo install` picks; SDK 57 expects reanimated 4.5.x and worklets 0.10.x.

---

## Building for distribution (EAS)

`eas.json` has three profiles:

| Profile | Android | iOS |
| --- | --- | --- |
| `development` | debug APK with dev client | dev client on a registered device |
| `preview` | **APK** for direct installation | ad-hoc build for registered devices |
| `production` | **AAB** for Google Play | App Store / TestFlight build |

```powershell
npx eas-cli@latest login
npx eas-cli@latest build:configure          # once; links the project to your Expo account
```

### Android APK (direct install)

A locally built test APK is in `dist/GeoCamera-1.0.0-android-test.apk`
(arm64-v8a + x86_64, about 112 MB, **signed with the debug key**: fine for
installing on your own phone, not for the Play Store). Rebuild it with
`npm run build:apk:local`; the output is `android/app/build/outputs/apk/release/app-release.apk`.

With EAS (properly signed, smaller per-device downloads are not needed for an APK):

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Download the `.apk` from the build page and install it (allow "install unknown
apps"). Local alternative without EAS:

```powershell
cd android
.\gradlew assembleRelease     # android/app/build/outputs/apk/release/app-release.apk
```

A local release build is signed with the debug key unless you configure your own
keystore — fine for testing, not for the Play Store.

### Android App Bundle (Play Store)

```powershell
npx eas-cli@latest build --platform android --profile production
```

EAS generates and stores the upload keystore on the first build (or upload your
own with `eas credentials`). Upload the `.aab` in Play Console, or use
`npx eas-cli@latest submit --platform android`.

Play policy note: the app requests `READ_MEDIA_IMAGES/VIDEO` to show its own
captures in the in-app gallery. Google Play may ask you to justify broad media
access; the app also works with partial ("selected photos") access.

### iPhone build and signing

iOS apps cannot be built on Windows locally; EAS builds them in the cloud.
You need an **Apple Developer Program** membership (paid) for installation on
physical iPhones.

1. Register the iPhone for internal builds: `npx eas-cli@latest device:create`
   (open the link on the iPhone and install the profile).
2. Build: `npx eas-cli@latest build --platform ios --profile preview`
   (or `development` for a dev client). EAS creates the certificate and an ad-hoc
   provisioning profile that includes the registered devices.
3. Open the build link on the iPhone to install. On iOS 16+ enable
   **Settings → Privacy & Security → Developer Mode** when asked.
4. For TestFlight / App Store: `--profile production`, then
   `npx eas-cli@latest submit --platform ios`.

Bundle identifier / package name: `com.eightbitbannar.geocam` (change in
`app.json` before the first store build if you own a different domain).

---

## Branding

All icons and logos come from one file, `assets/images/geo-cam-logo-source.png`
(the GEO-CAM logo supplied for the project). `python scripts/generate-brand-assets.py`
regenerates everything from it:

| Output | Used for |
| --- | --- |
| `assets/icon.png` | iOS app icon / legacy Android icon (the logo as supplied) |
| `assets/android-icon-foreground.png` + `-background.png` | Android adaptive icon (logo scaled to stay inside round and squircle masks, black background) |
| `assets/android-icon-monochrome.png` | Android 13+ themed icon (drawn pin-with-lens silhouette) |
| `assets/splash-icon.png` | Native splash screen on black |
| `assets/images/logo-full.png`, `logo-emblem.png`, `logo-wordmark.png` | In-app artwork (permission screen, camera top bar, Settings → About, empty gallery) and the logo badge on the stamp |

The app theme (`src/theme/index.ts`) uses colours sampled from the logo: pin blue
`#016BFB`, "GEO" blue `#0098FD`, glow cyan `#00CBFE`, "CAM" silver `#D1D7E1`, on black
and navy surfaces. The stamp's logo badge can be turned off in Stamp settings.

After changing the logo, run the script, then `npx expo prebuild --clean` and rebuild,
because icons and the splash screen are compiled into the native app.

## Platform notes and known limitations

- **Android albums:** photos go to `Pictures/Geo Camera`. Videos go to
  `Movies/Geo Camera` through the native module's MediaStore insert; if that is
  unavailable they fall back to `Pictures/Geo Camera`.
- **iOS albums:** saved to the Photos library, inside a "Geo Camera" album when
  the permission level allows creating albums.
- **Resolution / frame rate:** not user-selectable, to keep the app simple. Photos use the largest 4:3 size the camera reports, videos 1080p (or the closest the device supports) at the device's default frame rate.
- **Geocoding** needs the network and an OS geocoder backend (Google Play services on
  Android). Without it, coordinates are shown instead of an address.
- **Maps:** OpenStreetMap standard tiles (`tile.openstreetmap.org`), off until the user
  agrees (one-time question, or Settings → Privacy → Online maps). The app follows the
  [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/): its own
  `GEO-CAM/<version>` User-Agent, "© OpenStreetMap contributors" on every map, tiles
  cached ≥ 7 days (30 days here), max 2 parallel downloads, no prefetching and no
  "download area". OSM gives no service guarantee and may block heavy use, so a large
  public release should switch to a commercial tile provider: set `expo.extra.mapTileUrl`
  in `app.json` (e.g. a MapTiler/Stadia URL with your key) and rebuild.
  Without a map for the exact spot the stamp shows "Map unavailable", never a fake map.
- **Shared metadata:** many apps strip EXIF when sharing. The visible stamp is the
  primary record.
- **Save photos / save videos toggles** from the brief were intentionally left out:
  the app has no private storage, so turning saving off would silently discard captures.

## Privacy

See [`PRIVACY.md`](PRIVACY.md). Summary: no accounts, no server, no analytics,
foreground location only, optional OS geocoding that can be disabled with strict
offline mode.
