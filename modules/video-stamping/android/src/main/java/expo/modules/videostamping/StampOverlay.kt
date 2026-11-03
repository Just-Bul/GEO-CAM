package expo.modules.videostamping

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.media3.common.OverlaySettings
import androidx.media3.common.VideoFrameProcessingException
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.StaticOverlaySettings

/**
 * Shows pre-rendered stamp bitmaps, each during its own time range.
 *
 * Bitmaps are decoded lazily when their segment starts and the previous one is
 * released, so memory stays flat even for long dynamic-stamp videos.
 * Positions are given in pixels of the upright (display-oriented) frame and are
 * converted to Media3's normalised device coordinates here.
 */
@UnstableApi
internal class StampOverlay(
  private val segments: List<Segment>,
  private val expectedWidth: Int,
  private val expectedHeight: Int,
) : BitmapOverlay() {

  data class Segment(val path: String, val startUs: Long, val endUs: Long, val x: Float, val y: Float)

  private var frameWidth = expectedWidth
  private var frameHeight = expectedHeight
  private var currentIndex = -1
  private var currentBitmap: Bitmap? = null
  private var firstPresentationUs: Long = Long.MIN_VALUE

  /** Set when the pipeline delivers frames that do not match the layout; the export is then rejected. */
  @Volatile var problem: String? = null
    private set

  override fun configure(videoSize: Size) {
    super.configure(videoSize)
    frameWidth = videoSize.width
    frameHeight = videoSize.height
    if (frameWidth != expectedWidth || frameHeight != expectedHeight) {
      // The stamp was laid out for the upright frame; a different frame size would misplace it.
      problem = "Frame size ${frameWidth}x$frameHeight does not match expected ${expectedWidth}x$expectedHeight"
    }
  }

  private fun indexFor(presentationTimeUs: Long): Int {
    if (firstPresentationUs == Long.MIN_VALUE) firstPresentationUs = presentationTimeUs
    val t = presentationTimeUs - firstPresentationUs
    // Segments are sorted and contiguous; the last one also covers any trailing frames.
    for (i in segments.indices) {
      if (t < segments[i].endUs) return i
    }
    return segments.lastIndex
  }

  @Throws(VideoFrameProcessingException::class)
  override fun getBitmap(presentationTimeUs: Long): Bitmap {
    val index = indexFor(presentationTimeUs)
    if (index != currentIndex || currentBitmap == null) {
      val decoded = BitmapFactory.decodeFile(segments[index].path)
        ?: throw VideoFrameProcessingException("Could not decode overlay ${segments[index].path}")
      // The previous bitmap has already been uploaded to its GL texture and is no longer needed.
      currentBitmap?.recycle()
      currentBitmap = decoded
      currentIndex = index
    }
    return currentBitmap!!
  }

  override fun getOverlaySettings(presentationTimeUs: Long): OverlaySettings {
    val segment = segments[indexFor(presentationTimeUs)]
    // Place the overlay's top-left corner (-1, 1) at pixel (x, y) of the frame.
    val anchorX = 2f * segment.x / frameWidth - 1f
    val anchorY = 1f - 2f * segment.y / frameHeight
    return StaticOverlaySettings.Builder()
      .setOverlayFrameAnchor(-1f, 1f)
      .setBackgroundFrameAnchor(anchorX, anchorY)
      .build()
  }

  fun releaseBitmaps() {
    currentBitmap?.recycle()
    currentBitmap = null
    currentIndex = -1
  }
}
