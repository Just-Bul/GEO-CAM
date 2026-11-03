import AVFoundation
import ExpoModulesCore
import UIKit

struct OverlayRecord: Record {
  @Field var uri: String = ""
  @Field var startMs: Double = 0
  @Field var endMs: Double = 0
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 0
  @Field var height: Double = 0
}

struct StampOptions: Record {
  @Field var inputUri: String = ""
  @Field var outputUri: String = ""
  @Field var overlays: [OverlayRecord] = []
}

final class StampingException: GenericException<(code: String, message: String)> {
  override var code: String { param.code }
  override var reason: String { param.message }
}

public class VideoStampingModule: Module {
  private var sessions: [String: AVAssetExportSession] = [:]
  private var cancelled = Set<String>()
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("VideoStamping")

    Events("onProgress")

    Constant("isAvailable") { true }

    AsyncFunction("getVideoInfoAsync") { (uri: String) async throws -> [String: Any] in
      return try await Self.videoInfo(url: Self.fileURL(uri))
    }

    AsyncFunction("stampVideoAsync") { (jobId: String, options: StampOptions) async throws -> [String: Any] in
      return try await self.stamp(jobId: jobId, options: options)
    }

    AsyncFunction("cancelAsync") { (jobId: String) in
      self.lock.lock()
      self.cancelled.insert(jobId)
      let session = self.sessions[jobId]
      self.lock.unlock()
      session?.cancelExport()
    }

    // Opens the share sheet for one or more local files (file:// URLs).
    AsyncFunction("shareFilesAsync") { (uris: [String], _: String, title: String, promise: Promise) in
      let items = uris.map { Self.fileURL($0) }
      guard !items.isEmpty else {
        throw StampingException((code: "ERR_SHARE", message: "Nothing to share"))
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw StampingException((code: "ERR_NO_VIEW", message: "No view controller to present from"))
      }
      let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
      sheet.title = title
      sheet.completionWithItemsHandler = { _, _, _, _ in promise.resolve(nil) }
      if UIDevice.current.userInterfaceIdiom == .pad {
        let frame = presenter.view.frame
        sheet.popoverPresentationController?.sourceView = presenter.view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: frame.midX, y: frame.maxY, width: 0, height: 0)
      }
      presenter.present(sheet, animated: true)
    }
    .runOnQueue(.main)

    AsyncFunction("saveVideoToMoviesAsync") { (_: String, _: String) throws -> String in
      // iOS uses the Photos library through expo-media-library instead.
      throw StampingException((code: "ERR_UNSUPPORTED", message: "Not used on iOS"))
    }
  }

  static func fileURL(_ uri: String) -> URL {
    if let url = URL(string: uri), url.scheme != nil { return url }
    return URL(fileURLWithPath: uri)
  }

  static func orientation(for transform: CGAffineTransform) -> CGImagePropertyOrientation {
    let a = transform.a.rounded(), b = transform.b.rounded(), c = transform.c.rounded(), d = transform.d.rounded()
    switch (a, b, c, d) {
    case (0, 1, -1, 0): return .right   // recorded in portrait
    case (0, -1, 1, 0): return .left    // portrait upside down
    case (-1, 0, 0, -1): return .down   // landscape, rotated 180°
    case (-1, 0, 0, 1): return .upMirrored
    case (1, 0, 0, -1): return .downMirrored
    case (0, 1, 1, 0): return .leftMirrored
    case (0, -1, -1, 0): return .rightMirrored
    default: return .up
    }
  }

  static func videoInfo(url: URL) async throws -> [String: Any] {
    let asset = AVURLAsset(url: url)
    guard let track = try await asset.loadTracks(withMediaType: .video).first else {
      throw StampingException((code: "ERR_INVALID_VIDEO", message: "No video track"))
    }
    let (naturalSize, transform, frameRate, dataRate) = try await track.load(
      .naturalSize, .preferredTransform, .nominalFrameRate, .estimatedDataRate)
    let duration = try await asset.load(.duration)
    let audio = try await asset.loadTracks(withMediaType: .audio)
    let display = CGRect(origin: .zero, size: naturalSize).applying(transform)
    return [
      "width": Int(abs(display.width).rounded()),
      "height": Int(abs(display.height).rounded()),
      "rotation": Int((atan2(transform.b, transform.a) * 180 / .pi).rounded()),
      "durationMs": duration.seconds.isFinite ? duration.seconds * 1000 : 0,
      "hasAudio": !audio.isEmpty,
      "bitrate": Int(dataRate),
      "frameRate": Double(frameRate),
    ]
  }

  private func stamp(jobId: String, options: StampOptions) async throws -> [String: Any] {
    let inputURL = Self.fileURL(options.inputUri)
    let outputURL = Self.fileURL(options.outputUri)
    guard FileManager.default.fileExists(atPath: inputURL.path) else {
      throw StampingException((code: "ERR_INVALID_VIDEO", message: "Input video is missing"))
    }
    guard !options.overlays.isEmpty else {
      throw StampingException((code: "ERR_NO_OVERLAY", message: "No overlays supplied"))
    }
    try? FileManager.default.removeItem(at: outputURL)
    try FileManager.default.createDirectory(
      at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)

    let inputSize = (try? FileManager.default.attributesOfItem(atPath: inputURL.path)[.size] as? Int64) ?? 0
    if let free = try? URL(fileURLWithPath: NSTemporaryDirectory())
      .resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
      .volumeAvailableCapacityForImportantUsage,
      free < inputSize * 2 + 50 * 1024 * 1024
    {
      throw StampingException((code: "ERR_LOW_STORAGE", message: "Not enough storage space"))
    }

    let asset = AVURLAsset(url: inputURL)
    guard let sourceVideo = try await asset.loadTracks(withMediaType: .video).first else {
      throw StampingException((code: "ERR_INVALID_VIDEO", message: "No video track"))
    }
    let duration = try await asset.load(.duration)
    let (naturalSize, transform, nominalFrameRate) = try await sourceVideo.load(
      .naturalSize, .preferredTransform, .nominalFrameRate)
    let timeRange = CMTimeRange(start: .zero, duration: duration)

    let composition = AVMutableComposition()
    guard
      let videoTrack = composition.addMutableTrack(
        withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
      throw StampingException((code: "ERR_EXPORT", message: "Could not create video track"))
    }
    try videoTrack.insertTimeRange(timeRange, of: sourceVideo, at: .zero)
    for sourceAudio in try await asset.loadTracks(withMediaType: .audio) {
      if let audioTrack = composition.addMutableTrack(
        withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
      {
        // Inserted over the same time range as the video, so audio stays in sync.
        try audioTrack.insertTimeRange(timeRange, of: sourceAudio, at: .zero)
      }
    }

    let display = CGRect(origin: .zero, size: naturalSize).applying(transform)
    let renderSize = CGSize(width: abs(display.width).rounded(), height: abs(display.height).rounded())
    let overlays = options.overlays.map {
      StampOverlaySpec(
        url: Self.fileURL($0.uri),
        startSeconds: $0.startMs / 1000,
        endSeconds: $0.endMs / 1000,
        rect: CGRect(x: $0.x, y: $0.y, width: $0.width, height: $0.height))
    }

    let instruction = StampInstruction(
      timeRange: timeRange,
      trackID: videoTrack.trackID,
      orientation: Self.orientation(for: transform),
      renderSize: renderSize,
      overlays: overlays)

    let videoComposition = AVMutableVideoComposition()
    videoComposition.customVideoCompositorClass = StampCompositor.self
    videoComposition.renderSize = renderSize
    let fps = nominalFrameRate > 0 ? nominalFrameRate : 30
    videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))
    videoComposition.instructions = [instruction]

    guard
      let session = AVAssetExportSession(
        asset: composition, presetName: AVAssetExportPresetHighestQuality)
    else {
      throw StampingException((code: "ERR_EXPORT", message: "Could not create export session"))
    }
    session.outputURL = outputURL
    session.outputFileType = .mp4
    session.videoComposition = videoComposition
    session.shouldOptimizeForNetworkUse = true

    lock.lock()
    sessions[jobId] = session
    lock.unlock()

    let progressTask = Task { [weak self, weak session] in
      while !Task.isCancelled, let session = session, session.status == .waiting || session.status == .exporting {
        self?.sendEvent("onProgress", ["jobId": jobId, "progress": Double(session.progress)])
        try? await Task.sleep(nanoseconds: 250_000_000)
      }
    }

    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      session.exportAsynchronously { continuation.resume() }
    }
    progressTask.cancel()

    lock.lock()
    sessions[jobId] = nil
    let wasCancelled = cancelled.remove(jobId) != nil
    lock.unlock()

    switch session.status {
    case .completed:
      let size = (try? FileManager.default.attributesOfItem(atPath: outputURL.path)[.size] as? Int64) ?? 0
      guard size > 0 else {
        throw StampingException((code: "ERR_EXPORT", message: "Export produced no file"))
      }
      sendEvent("onProgress", ["jobId": jobId, "progress": 1.0])
      return [
        "outputUri": outputURL.absoluteString,
        "durationMs": duration.seconds * 1000,
        "fileSizeBytes": Double(size),
      ]
    case .cancelled:
      try? FileManager.default.removeItem(at: outputURL)
      throw StampingException((code: "ERR_CANCELLED", message: "Cancelled"))
    default:
      try? FileManager.default.removeItem(at: outputURL)
      if wasCancelled {
        throw StampingException((code: "ERR_CANCELLED", message: "Cancelled"))
      }
      let error = session.error as NSError?
      if error?.code == AVError.diskFull.rawValue {
        throw StampingException((code: "ERR_LOW_STORAGE", message: "Disk full"))
      }
      throw StampingException(
        (code: "ERR_EXPORT", message: error?.localizedDescription ?? "Export failed"))
    }
  }
}
