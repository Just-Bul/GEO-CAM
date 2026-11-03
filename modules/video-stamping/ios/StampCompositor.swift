import AVFoundation
import CoreImage

struct StampOverlaySpec {
  let url: URL
  let startSeconds: Double
  let endSeconds: Double
  /// Position in pixels of the upright frame, origin at the top-left.
  let rect: CGRect
}

final class StampInstruction: NSObject, AVVideoCompositionInstructionProtocol {
  let timeRange: CMTimeRange
  let enablePostProcessing = false
  let containsTweening = true
  let requiredSourceTrackIDs: [NSValue]?
  let passthroughTrackID = kCMPersistentTrackID_Invalid

  let trackID: CMPersistentTrackID
  let orientation: CGImagePropertyOrientation
  let renderSize: CGSize
  let overlays: [StampOverlaySpec]

  init(
    timeRange: CMTimeRange, trackID: CMPersistentTrackID, orientation: CGImagePropertyOrientation,
    renderSize: CGSize, overlays: [StampOverlaySpec]
  ) {
    self.timeRange = timeRange
    self.trackID = trackID
    self.orientation = orientation
    self.renderSize = renderSize
    self.overlays = overlays
    self.requiredSourceTrackIDs = [NSNumber(value: trackID)]
  }
}

/// Custom compositor: rotates each source frame upright, then draws the stamp
/// bitmap for the frame's time on top. Only the current stamp image is kept in
/// memory, so long dynamic-stamp videos do not grow memory use.
final class StampCompositor: NSObject, AVVideoCompositing {
  var sourcePixelBufferAttributes: [String: any Sendable]? {
    [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
  }
  var requiredPixelBufferAttributesForRenderContext: [String: any Sendable] {
    [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
  }

  private let context = CIContext(options: [.cacheIntermediates: false])
  private let queue = DispatchQueue(label: "geocam.stamp.compositor")
  private var cachedIndex = -1
  private var cachedImage: CIImage?

  func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {}

  func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
    queue.async { [weak self] in
      guard let self else { return }
      autoreleasepool {
        do {
          request.finish(withComposedVideoFrame: try self.render(request))
        } catch {
          request.finish(with: error)
        }
      }
    }
  }

  func cancelAllPendingVideoCompositionRequests() {
    queue.sync {}
  }

  private func overlayImage(for instruction: StampInstruction, at seconds: Double) -> (CIImage, CGRect)? {
    let overlays = instruction.overlays
    guard !overlays.isEmpty else { return nil }
    var index = overlays.count - 1
    for (i, overlay) in overlays.enumerated() where seconds < overlay.endSeconds {
      index = i
      break
    }
    if index != cachedIndex || cachedImage == nil {
      cachedImage = CIImage(contentsOf: overlays[index].url)
      cachedIndex = index
    }
    guard let image = cachedImage else { return nil }
    return (image, overlays[index].rect)
  }

  private func render(_ request: AVAsynchronousVideoCompositionRequest) throws -> CVPixelBuffer {
    guard let instruction = request.videoCompositionInstruction as? StampInstruction,
      let source = request.sourceFrame(byTrackID: instruction.trackID),
      let output = request.renderContext.newPixelBuffer()
    else {
      throw NSError(
        domain: "VideoStamping", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Missing frame or instruction"])
    }

    // Rotate to the display orientation and move the result back to the origin.
    var frame = CIImage(cvPixelBuffer: source).oriented(instruction.orientation)
    frame = frame.transformed(
      by: CGAffineTransform(translationX: -frame.extent.origin.x, y: -frame.extent.origin.y))

    let seconds = request.compositionTime.seconds
    if let (overlay, rect) = overlayImage(for: instruction, at: seconds) {
      // Core Image uses a bottom-left origin; the layout uses top-left.
      let y = instruction.renderSize.height - rect.origin.y - overlay.extent.height
      let placed = overlay.transformed(
        by: CGAffineTransform(translationX: rect.origin.x - overlay.extent.origin.x, y: y - overlay.extent.origin.y))
      frame = placed.composited(over: frame)
    }

    context.render(
      frame, to: output,
      bounds: CGRect(origin: .zero, size: instruction.renderSize),
      colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
    return output
  }
}
