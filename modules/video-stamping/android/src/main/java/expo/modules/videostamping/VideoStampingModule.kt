package expo.modules.videostamping

import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.content.Context
import android.media.MediaMetadataRetriever
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import android.provider.MediaStore
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import androidx.media3.common.Effect
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.TextureOverlay
import com.google.common.collect.ImmutableList
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileInputStream

class OverlayRecord : Record {
  @Field val uri: String = ""
  @Field val startMs: Double = 0.0
  @Field val endMs: Double = 0.0
  @Field val x: Double = 0.0
  @Field val y: Double = 0.0
  @Field val width: Double = 0.0
  @Field val height: Double = 0.0
}

class StampOptions : Record {
  @Field val inputUri: String = ""
  @Field val outputUri: String = ""
  @Field val overlays: List<OverlayRecord> = emptyList()
}

private class StampingException(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)

@UnstableApi
class VideoStampingModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw StampingException("ERR_NO_CONTEXT", "React context is not available")

  private val mainHandler = Handler(Looper.getMainLooper())

  /** A running export. Only touched on the main thread. */
  private class Job(
    val transformer: Transformer,
    val promise: Promise,
    val output: File,
    val overlay: StampOverlay,
  )

  private val jobs = mutableMapOf<String, Job>()

  /**
   * Settles a job exactly once and cleans up. Every exit path goes through here:
   * completion, error, cancellation and the stall watchdog. (Transformer.cancel()
   * does not call the listener, so cancellation must settle the promise itself.)
   */
  private fun finish(jobId: String, error: StampingException?, result: Map<String, Any>? = null) {
    val job = jobs.remove(jobId) ?: return
    job.overlay.releaseBitmaps()
    if (error != null) {
      job.output.delete()
      job.promise.reject(error)
    } else {
      job.promise.resolve(result)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("VideoStamping")

    Events("onProgress")

    Constant("isAvailable") { true }

    AsyncFunction("getVideoInfoAsync") { uri: String ->
      readVideoInfo(uri)
    }

    AsyncFunction("stampVideoAsync") { jobId: String, options: StampOptions, promise: Promise ->
      startStamping(jobId, options, promise)
    }

    AsyncFunction("cancelAsync") { jobId: String ->
      mainHandler.post {
        val job = jobs[jobId] ?: return@post
        job.transformer.cancel()
        finish(jobId, StampingException("ERR_CANCELLED", "Cancelled"))
      }
    }

    // Opens the system share sheet for one or more gallery items (MediaStore
    // content URIs). Read access is granted to the receiving app only.
    AsyncFunction("shareFilesAsync") { uris: List<String>, mimeType: String, title: String ->
      val activity = appContext.currentActivity
        ?: throw StampingException("ERR_NO_ACTIVITY", "No activity to show the share sheet")
      val parsed = ArrayList(uris.map { Uri.parse(it) })
      if (parsed.isEmpty()) throw StampingException("ERR_SHARE", "Nothing to share")
      val intent = if (parsed.size == 1) {
        Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, parsed[0])
      } else {
        Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, parsed)
      }
      intent.type = mimeType
      val clip = ClipData.newUri(activity.contentResolver, "GEO-CAM", parsed[0])
      parsed.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
      intent.clipData = clip
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      activity.startActivity(Intent.createChooser(intent, title))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("saveVideoToMoviesAsync") { fileUri: String, albumName: String, promise: Promise ->
      try {
        saveToMovies(fileUri, albumName, promise)
      } catch (e: Throwable) {
        promise.reject(StampingException("ERR_SAVE", e.message ?: "Could not save video", e))
      }
    }
  }

  private fun pathOf(uri: String): String =
    if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri.removePrefix("file://") else uri

  private fun readVideoInfo(uri: String): Map<String, Any?> {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(pathOf(uri))
      val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
      val hasAudio = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"
      val bitrate = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toIntOrNull()
      val frameRate = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE)?.toFloatOrNull()
      } else null
      val swap = rotation == 90 || rotation == 270
      return mapOf(
        "width" to if (swap) height else width,
        "height" to if (swap) width else height,
        "rotation" to rotation,
        "durationMs" to duration.toDouble(),
        "hasAudio" to hasAudio,
        "bitrate" to bitrate,
        "frameRate" to frameRate,
      )
    } catch (e: Exception) {
      throw StampingException("ERR_INVALID_VIDEO", "Could not read video: ${e.message}", e)
    } finally {
      retriever.release()
    }
  }

  private fun startStamping(jobId: String, options: StampOptions, promise: Promise) {
    val inputPath = pathOf(options.inputUri)
    val outputPath = pathOf(options.outputUri)
    val input = File(inputPath)
    if (!input.exists() || input.length() == 0L) {
      promise.reject(StampingException("ERR_INVALID_VIDEO", "Input video is missing"))
      return
    }
    if (options.overlays.isEmpty()) {
      promise.reject(StampingException("ERR_NO_OVERLAY", "No overlays supplied"))
      return
    }
    val outputFile = File(outputPath)
    outputFile.parentFile?.mkdirs()
    val free = StatFs(outputFile.parentFile?.absolutePath ?: context.cacheDir.absolutePath).availableBytes
    if (free < input.length() * 2 + 50L * 1024 * 1024) {
      promise.reject(StampingException("ERR_LOW_STORAGE", "Not enough storage space"))
      return
    }

    val info = readVideoInfo(options.inputUri)
    val sourceBitrate = (info["bitrate"] as? Int) ?: 0
    val segments = options.overlays.map {
      StampOverlay.Segment(
        path = pathOf(it.uri),
        startUs = (it.startMs * 1000).toLong(),
        endUs = (it.endMs * 1000).toLong(),
        x = it.x.toFloat(),
        y = it.y.toFloat(),
      )
    }
    val overlay = StampOverlay(
      segments,
      expectedWidth = (info["width"] as Int),
      expectedHeight = (info["height"] as Int),
    )

    mainHandler.post {
      try {
        // Keep roughly the source bitrate so stamping does not visibly degrade quality.
        val videoBitrate = maxOf(4_000_000, (sourceBitrate * 0.9).toInt())
        val encoderFactory = DefaultEncoderFactory.Builder(context)
          .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(videoBitrate).build())
          .setEnableFallback(true)
          .build()

        val transformer = Transformer.Builder(context)
          .setVideoMimeType(MimeTypes.VIDEO_H264)
          .setEncoderFactory(encoderFactory)
          .addListener(object : Transformer.Listener {
            override fun onCompleted(composition: Composition, exportResult: ExportResult) {
              when {
                !outputFile.exists() || outputFile.length() == 0L ->
                  finish(jobId, StampingException("ERR_EXPORT", "Export produced no file"))
                overlay.problem != null ->
                  finish(jobId, StampingException("ERR_OVERLAY", overlay.problem ?: "Overlay failed"))
                else -> {
                  sendEvent("onProgress", mapOf("jobId" to jobId, "progress" to 1.0))
                  finish(
                    jobId,
                    null,
                    mapOf(
                      "outputUri" to Uri.fromFile(outputFile).toString(),
                      "durationMs" to exportResult.durationMs.toDouble(),
                      "fileSizeBytes" to exportResult.fileSizeBytes.toDouble(),
                    ),
                  )
                }
              }
            }

            override fun onError(
              composition: Composition,
              exportResult: ExportResult,
              exportException: ExportException,
            ) {
              val code = when (exportException.errorCode) {
                in ExportException.ERROR_CODE_DECODER_INIT_FAILED..ExportException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED -> "ERR_CODEC"
                in ExportException.ERROR_CODE_ENCODER_INIT_FAILED..ExportException.ERROR_CODE_ENCODING_FORMAT_UNSUPPORTED -> "ERR_CODEC"
                else -> "ERR_EXPORT"
              }
              finish(
                jobId,
                StampingException(code, exportException.errorCodeName + ": " + (exportException.message ?: ""), exportException),
              )
            }
          })
          .build()

        val editedItem = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(input)))
          .setEffects(
            Effects(
              ImmutableList.of<AudioProcessor>(),
              ImmutableList.of<Effect>(OverlayEffect(ImmutableList.of<TextureOverlay>(overlay))),
            ),
          )
          .build()

        jobs[jobId] = Job(transformer, promise, outputFile, overlay)
        transformer.start(editedItem, outputPath)
        pollProgress(jobId, transformer)
      } catch (e: Throwable) {
        if (jobs.containsKey(jobId)) {
          finish(jobId, StampingException("ERR_EXPORT", e.message ?: "Could not start export", e))
        } else {
          overlay.releaseBitmaps()
          outputFile.delete()
          promise.reject(StampingException("ERR_EXPORT", e.message ?: "Could not start export", e))
        }
      }
    }
  }

  /** Reports progress and fails the job if it stops advancing for too long. */
  private fun pollProgress(jobId: String, transformer: Transformer) {
    val holder = ProgressHolder()
    var lastProgress = -1
    var lastChange = System.currentTimeMillis()
    val tick = object : Runnable {
      override fun run() {
        if (jobs[jobId]?.transformer !== transformer) return
        val state = transformer.getProgress(holder)
        if (state == Transformer.PROGRESS_STATE_AVAILABLE) {
          if (holder.progress != lastProgress) {
            lastProgress = holder.progress
            lastChange = System.currentTimeMillis()
            sendEvent("onProgress", mapOf("jobId" to jobId, "progress" to holder.progress / 100.0))
          }
        }
        if (System.currentTimeMillis() - lastChange > STALL_TIMEOUT_MS) {
          transformer.cancel()
          finish(jobId, StampingException("ERR_EXPORT", "Export stalled"))
          return
        }
        mainHandler.postDelayed(this, 250)
      }
    }
    mainHandler.post(tick)
  }

  private companion object {
    /** No progress for this long means the codec pipeline is stuck. */
    const val STALL_TIMEOUT_MS = 120_000L
  }

  /** Inserts the finished video into Movies/<album> and resolves with its content URI. */
  private fun saveToMovies(fileUri: String, albumName: String, promise: Promise) {
    val source = File(pathOf(fileUri))
    if (!source.exists()) {
      promise.reject(StampingException("ERR_INVALID_VIDEO", "Video file is missing"))
      return
    }
    val resolver = context.contentResolver
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.Video.Media.DISPLAY_NAME, source.name)
        put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
        put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/$albumName")
        put(MediaStore.Video.Media.IS_PENDING, 1)
      }
      val collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      val item = resolver.insert(collection, values)
        ?: throw StampingException("ERR_SAVE", "MediaStore refused the video")
      try {
        resolver.openOutputStream(item)?.use { out ->
          FileInputStream(source).use { it.copyTo(out) }
        } ?: throw StampingException("ERR_SAVE", "Could not open MediaStore output")
        values.clear()
        values.put(MediaStore.Video.Media.IS_PENDING, 0)
        resolver.update(item, values, null, null)
        promise.resolve(item.toString())
      } catch (e: Throwable) {
        resolver.delete(item, null, null)
        throw e
      }
    } else {
      @Suppress("DEPRECATION")
      val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), albumName)
      directory.mkdirs()
      val target = File(directory, source.name)
      source.copyTo(target, overwrite = false)
      MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), arrayOf("video/mp4")) { _, uri ->
        if (uri != null) promise.resolve(uri.toString())
        else promise.reject(StampingException("ERR_SAVE", "Media scanner did not index the video"))
      }
    }
  }
}
