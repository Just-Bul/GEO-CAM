# video-stamping (local Expo module)

Burns Geo Camera's location stamp into recorded videos on the device.

The stamp itself is **drawn in JavaScript** by the shared Skia renderer
(`src/features/stamping/stampRenderer.ts`) — the same code that stamps photos
and draws the live preview. This module only composites those pre-rendered PNG
images onto the video frames, so Android and iOS produce the same-looking stamp.

## JavaScript API (`modules/video-stamping/index.ts`)

| Function | Description |
| --- | --- |
| `isVideoStampingAvailable()` | `false` if the native module is not compiled into the build (e.g. Expo Go). |
| `getVideoInfo(uri)` | Display width/height (rotation applied), rotation, duration, audio presence, bitrate. |
| `stampVideoNative({ inputUri, outputUri, overlays }, onProgress)` | Starts a job; returns `{ jobId, promise }`. Progress 0–1. |
| `cancelStampJob(jobId)` | Cancels a running job; the promise rejects with `ERR_CANCELLED` and the partial output is deleted. |
| `shareFiles(uris, mimeType, title)` | System share sheet for several items at once (Android: MediaStore content URIs with read permission granted to the receiver; iOS: file URLs via `UIActivityViewController`). |
| `saveVideoToMovies(fileUri, album)` | Android only: inserts into `Movies/<album>` through MediaStore, returns the content URI. |

An overlay is `{ uri, startMs, endMs, x, y, width, height }`: a PNG shown from
`startMs` to `endMs`, top-left at pixel `(x, y)` of the **upright** frame.
Fixed stamps use one overlay for the whole video; dynamic stamps use one per
second (coarser for very long videos), each built from real GPS readings.

Error codes: `ERR_INVALID_VIDEO`, `ERR_NO_OVERLAY`, `ERR_LOW_STORAGE`,
`ERR_CODEC`, `ERR_EXPORT`, `ERR_OVERLAY`, `ERR_CANCELLED`.

## Android — AndroidX Media3 Transformer 1.9.0

`VideoStampingModule.kt`, `StampOverlay.kt`

- `Transformer` with an `OverlayEffect` holding one `BitmapOverlay` subclass.
- Bitmaps are decoded lazily when their segment starts; the previous bitmap is
  recycled, so memory stays flat for long videos.
- Pixel positions are converted to Media3 NDC anchors:
  `x_ndc = 2x/W − 1`, `y_ndc = 1 − 2y/H` with the overlay anchor at its
  top-left `(-1, 1)` (verified against `OverlayMatrixProvider` in 1.9.0: overlays
  are drawn at their native pixel size).
- If the effect pipeline reports a frame size different from the expected
  upright size, the export is rejected (`ERR_OVERLAY`) instead of saving a
  misplaced stamp.
- Output: H.264 video at roughly the source bitrate (min 4 Mbit/s); audio is
  passed through unchanged, which keeps it in sync.
- Media3 is pinned to the version `expo-video` uses (1.9.0) so the app has a
  single Media3 copy. Update both together.

## iOS — AVFoundation

`VideoStampingModule.swift`, `StampCompositor.swift`

- `AVMutableComposition` (video + all audio tracks over the same time range).
- A custom `AVVideoCompositing` compositor: each frame is rotated upright with
  `CIImage.oriented(_:)` (derived from the track's `preferredTransform`), the
  stamp image for that time is composited with Core Image, then rendered into
  the output buffer. Only the current stamp image is kept in memory.
- Export with `AVAssetExportSession` (`AVAssetExportPresetHighestQuality`, MP4).

> **Status:** the iOS code has **not been compiled or run** — it was written on
> Windows, where Xcode is unavailable. Build it with EAS Build or on a Mac and
> test it before release (see `TESTING.md`).

## Rebuilding

Native code changes need a new native build:

```sh
npx expo prebuild --clean   # regenerates android/ and ios/
npx expo run:android        # or: eas build --profile development
```
