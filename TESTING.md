# Geo Camera — Testing

This file records what has **actually been run**, how, and what was observed.
Nothing is marked as passed unless it was executed and the result checked.

Legend: ✅ tested and passed · ⚠️ tested with a limitation (see note) · ❌ not tested yet · 🚫 not implemented

## Test environments used

| Environment | Details |
| --- | --- |
| Automated (Node) | `npm test` — 27 tests: formatting, location freshness, settings validation, address formatting, stamp content rules, picture-size selection, dynamic-stamp reading selection, EXIF writer, stamp renderer (real app renderer on Skia CanvasKit, 6 layouts written to `tests/output/*.png`). `python tests/verify_exif.py` re-reads the EXIF with Pillow. |
| Static | `npx tsc --noEmit` (0 errors), `npx expo lint` (0 problems), `npx expo-doctor` (21/21 checks). |
| Android emulator | Pixel 6 AVD, Android 14 (API 34, google_apis, x86_64, 2 GB RAM). Development build (`assembleDebug`) + Metro for most tests; **release build** (`assembleRelease`, JS bundled, no dev server) for a fresh-install run. GPS positions set with `adb emu geo fix`; output files pulled with `adb` and inspected (Pillow, OpenCV, MP4 box parsing). |
| Physical Android phone | **Not yet** |
| iPhone / iOS Simulator | **Not possible on this Windows PC.** The iOS code (including the Swift video module) has never been compiled. |

## Required checks (from the project brief)

| # | Check | Result | Evidence / notes |
| --- | --- | --- | --- |
| 1 | App opens without login | ✅ Android emulator | Permission screen on first run, then straight to the camera on every later launch. No account screens exist. |
| 2 | Camera works on Android | ⚠️ Emulator | Live preview (rear "virtual scene" and front camera), front/rear switch, pinch zoom UI, flash/torch buttons. Flash itself not verifiable (emulator has none). Must be confirmed on a real phone. |
| 3 | Camera works on iPhone | ❌ | Needs an EAS iOS build and an iPhone. |
| 4 | Photos captured correctly | ⚠️ Emulator | Files saved as `Pictures/Geo Camera/GEO_YYYYMMDD_HHMMSS.jpg`. **The emulator's camera returns black still frames** (the untouched `_original.jpg` straight from the camera is also black, while the emulator's video and the system camera app produce content), so photo content quality is unverified until tested on a phone. |
| 5 | Videos recorded correctly | ✅ Emulator | 11–54 s recordings, portrait 720×1280, real scene content, saved to `Movies/Geo Camera/`. |
| 6 | GPS coordinates are real | ✅ Emulator | Stamp, EXIF and capture record all show exactly the coordinates injected with `geo fix` (e.g. 23.780572, 90.407015 → EXIF 23.780572, 90.407015). |
| 7 | GPS accuracy displayed honestly | ✅ Unit + emulator | Accuracy is rounded up (`7.01 m → ±8 m`, unit test); emulator showed "GPS ±5 m". Approximate permission is labelled "Approx." (logic unit-covered; not exercised on a device). |
| 8 | Cached location identified | ✅ Unit + emulator | Stamp showed "Cached location · 59 s old" once the live fix aged out. OS last-known readings are never "current" (unit test). |
| 9 | Address failures don't block capture | ✅ Emulator | Geocoder timeouts (`DEADLINE_EXCEEDED`) were logged and ignored; capture continued with coordinates. |
| 10 | Photo stamps permanently embedded | ✅ Emulator + headless | Stamp pixels present in the saved JPEG (pulled and viewed); headless renders at 12 MP and other sizes. |
| 11 | Video stamps permanently embedded | ✅ Emulator | Frames extracted with OpenCV at 1 s / 5 s / 10 s / end: stamp present, upright, bottom-left. Fixed mode keeps the start time; dynamic mode updates time and coordinates from real readings. |
| 12 | Images preserve orientation | ⚠️ | Output Orientation tag is 1 and portrait frames are upright on the emulator. Rotated-device and landscape captures not tested on hardware. |
| 13 | Video audio stays in sync | ✅ Emulator | Stamped files keep the audio track; audio/video track durations and frame counts are identical to the camera's original (13.880/13.883 s; 321 frames). Audio is passed through, not re-encoded. Listening test on a phone still recommended. |
| 14 | Media saved to Android Gallery | ✅ Emulator | Verified via MediaStore queries (`relative_path=Pictures/Geo Camera/`, `Movies/Geo Camera/`). |
| 15 | Media saved to iPhone Photos | ❌ | |
| 16 | Media available after restart | ✅ Emulator | Captures listed in the in-app gallery after app restart, reinstall and emulator reboot. |
| 17 | Offline capture works | ✅ Emulator | Airplane mode on + strict offline mode: photo captured, stamped and saved; GPS still worked. |
| 18 | Offline processing works | ✅ Emulator | Same run; video stamping needs no network either (Media3 runs locally). |
| 19 | Map absence doesn't block capture | ✅ Emulator | Airplane mode in a never-visited city: "Map unavailable" card, capture works. |
| 20 | Settings persist locally | ✅ Emulator + unit | Video stamp mode, "save original", offline mode survived restarts and a reinstall. Corrupted values fall back to defaults (unit test). |
| 21 | Permissions requested appropriately | ✅ Emulator | Camera on first launch; location when the camera opens (precise/approximate dialog); microphone only when switching to video; media library on first save. Merged manifest checked: no background location, no foreground-service location. |
| 22 | Partial photo-library access | ❌ | Code path exists (banner + "Manage" in gallery). Not exercised. |
| 23 | Low-storage errors handled | ❌ | Free-space checks exist (photo 40 MB, recording 300 MB, video export 2× input). Not exercised. |
| 24 | Temporary files cleaned up | ✅ Emulator | After saves and after a cancelled export the processing folder had no files for that capture; Settings showed "Temporary files 0 · 0 B". |
| 25 | No media uploaded to a server | ✅ By design | The app contains no upload code, no backend URL and no analytics SDK. Network monitoring was not performed. |
| 26 | No account required | ✅ | |
| 27 | No false GPS coordinates | ✅ Emulator + unit | Location denied → "Location unavailable", **no GPS IFD in the EXIF**; `(0,0)` and out-of-range readings are rejected (code); mock providers are labelled. |
| 28 | Usable on small screens | ❌ | Only the Pixel 6 size was run. Layout scales from window size; not verified on small devices. |
| 29 | Video failures don't corrupt originals | ✅ Emulator | Cancelled export → original saved unstamped with a message; app killed mid-export → original recovered at next launch ("A capture interrupted earlier was saved without its stamp"). |
| 30 | Both platform builds tested | ❌ | Android only (debug + release APK on the emulator). iOS not built. |

## Other behaviour verified on the emulator

- "Allow location" from the GPS pill and from the capture prompt after a denial; the app then waits for a **fresh** fix (photo carried the coordinates sent after granting).
- Moving the GPS position updated the live address (real Google geocoder results such as "48 Bir Uttam AK Khandakar Rd, Dhaka 1212"); the old address is dropped after moving >60 m.
- In-app gallery: filters, "No stamp" badges, video playback, details panel, system share sheet opens with the `GEO_…mp4` file, delete with app confirmation plus Android's system confirmation; item removed from MediaStore and the grid.
- Home → return: camera preview resumes.
- **Release APK, fresh install** (uninstalled first, no Metro): permission screen → camera → precise-location prompt → live GPS → "No location fix yet" prompt with *Wait for location* → photo-library prompt ("Allow all") → photo saved; microphone prompt → stamped video saved to `Movies/Geo Camera/` with the stamp in the frames.

## Simplified controls and sharing — emulator, release APK

- Settings no longer shows photo/video resolution, frame rate or "Record sound"; About shows "Powered by 8BITBANNAR".
- Video mode: torch and microphone buttons side by side in the top bar; tapping the mic switches to a red crossed-out mic ("Sound off") and back.
- Gallery: long-press starts selection, tap adds items, header shows "2 selected", bar shows Select all / Share (2) / Delete. Share (2) opened Android's sheet "Sharing 2 images" with both previews.
- Photo viewer: share button in the top-right opened "Sharing image".
- Multi-file sharing uses a new native function (`shareFilesAsync`): Android tested; the iOS version is written but not compiled.

## Mini map (OpenStreetMap) — emulator, release APK

- One-time "Show a map in the stamp?" question; maps stay off until the user agrees.
- New city (nothing cached): real OSM street map in the live preview within ~4 s; pin at the exact coordinates; "© OpenStreetMap contributors" shown.
- Photo: map burned into the saved JPEG (pulled and viewed).
- Airplane mode: a previously visited place still shows its map from saved tiles; a never-visited place shows "Map unavailable".
- Automated: tile maths vs. the OSM wiki formula, exact centring of composed maps (incl. tile seams and the antimeridian), no map when any tile is missing, map + credit in the stamp.
- Bug found and fixed: a freshly downloaded tile could be read before `File.move()` had finished (it is asynchronous), which made the map wait until its timeout. The move is now awaited and missing files are never handed to the decoder.

## Branding (GEO-CAM logo) — checked on the emulator, release APK

- Launcher icon (adaptive, round mask) shows the full logo including the "GEO-CAM" wordmark; label "GEO-CAM".
- First-run screen shows the logo; camera top bar shows the wordmark; Settings → About and the empty gallery show the logo/emblem.
- Live stamp preview and saved photos carry the emblem + "GEO-CAM" badge (pixels checked in the pulled JPEG); it can be switched off in Stamp settings. Headless test covers badge on/off and custom watermark.
- Splash screen: the first build clipped the wordmark (Android 12+ masks the splash icon to a circle). The splash image was re-fitted to the mask; after rebuilding, the full logo including "GEO-CAM" shows on black. ✅

## Bugs found by device testing and fixed

| Bug | Fix |
| --- | --- |
| Stamp preview crashed with "Value is undefined, expected an Object" (native Skia treats keys set to `undefined` as present; CanvasKit in tests does not) | Style objects only contain defined keys; the headless test helper now rejects `undefined` keys like the device does. |
| Native crash (SIGSEGV in Fabric `MountingCoordinator::pullTransaction`) when Skia's `<Canvas>` mounted | Preview uses `SkiaPictureView` with a pre-recorded picture. |
| Cancelling video stamping left the app waiting forever (Media3 `Transformer.cancel()` does not call the listener) | Native jobs settle on every path; 2-minute stall watchdog; JS races the native promise with the cancel signal. |
| Original recording lost if the app was killed mid-processing | Recovery journal; originals are deleted only after a save succeeded. |
| No way to re-request location after one denial | "Allow location" in the GPS pill and capture prompt. |
| **First launch: GPS never started** — the permission dialog paused the app ("background" → stop), and the restart that followed was dropped because the first start was still awaiting the dialog | A start request that arrives mid-start is queued and run afterwards (verified on a fresh install of the release APK). |
| "Max" photo resolution was left to the library | Sizes are read from the camera; "Highest" picks the largest 4:3 size; resolution choice added to Settings. |
| npm installed reanimated 4.7 / worklets 0.13 (not SDK 57 versions) | Pinned to the SDK versions (4.5.1 / 0.10.1). |

## Not yet tested — do these before a release

1. Physical Android phone (ideally two: a mid-range and a recent one): real photo content and resolution, flash/torch, orientation in landscape, 5–10 minute videos, battery/temperature, partial photo access, approximate location, low storage.
2. iOS: first EAS build (the Swift module has never been compiled), then all checks above on an iPhone, including limited Photos access.
3. Small-screen layout (≤ 5" / 320 dp width) and large font scaling.
4. Install the test APK (`dist/GeoCamera-1.0.0-android-test.apk`, signed with the debug key) on a phone and repeat the checklist.
