package com.sparkyapps.sparkyfitness.wear

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/**
 * Samples heart rate for the exercise on screen and sends it to the phone
 * in the same batches the Apple Watch sends. One exercise at a time.
 */
internal object WearHeartRate {
  var bpm by mutableIntStateOf(0)
    private set
  var permissionNeeded by mutableStateOf(false)
    private set

  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private val samples = ArrayDeque<Sample>()
  private val seen = LinkedHashSet<String>()
  private var appContext: Context? = null
  private var sessionId: String? = null
  private var exerciseEntryId: String? = null
  private var shownAt = 0L
  @Volatile private var running = false
  @Volatile private var startToken = 0
  private var asked = false

  private data class Sample(val t: String, val bpm: Int)

  private val callback = object : ExerciseUpdateCallback {
    override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
      val boot = Instant.ofEpochMilli(
        System.currentTimeMillis() - SystemClock.elapsedRealtime()
      )
      val points = try {
        update.latestMetrics.getData(DataType.HEART_RATE_BPM)
      } catch (_: Exception) {
        return
      }
      main.post {
        points.forEach { point ->
          val stamp = point.getTimeInstant(boot).toString()
          if (!seen.add(stamp)) return@forEach
          while (seen.size > 2000) seen.remove(seen.first())
          val reading = point.value.roundToInt()
          if (reading <= 0) return@forEach
          samples.addLast(Sample(stamp, reading))
          bpm = reading
        }
      }
    }

    override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}

    override fun onAvailabilityChanged(
      dataType: DataType<*, *>,
      availability: Availability,
    ) {}
  }

  private val flushRunnable = object : Runnable {
    override fun run() {
      flush()
      if (running) main.postDelayed(this, 60_000)
    }
  }

  fun onExercise(context: Context, session: String, exercise: String) {
    if (exercise.isEmpty()) return
    appContext = context.applicationContext
    if (exercise != exerciseEntryId) {
      flush()
      exerciseEntryId = exercise
      shownAt = System.currentTimeMillis()
    }
    sessionId = session
    if (!permitted(context)) {
      if (!asked) permissionNeeded = true
      return
    }
    ensureRunning()
  }

  fun onStop(context: Context) {
    appContext = context.applicationContext
    flush()
    sessionId = null
    exerciseEntryId = null
    bpm = 0
    stopSampling()
  }

  fun onPermissionResult(context: Context, granted: Boolean) {
    asked = true
    permissionNeeded = false
    if (!granted) return
    val session = sessionId ?: return
    val exercise = exerciseEntryId ?: return
    onExercise(context, session, exercise)
  }

  private fun permitted(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.BODY_SENSORS) ==
      PackageManager.PERMISSION_GRANTED

  private fun ensureRunning() {
    if (running) return
    val context = appContext ?: return
    val token = ++startToken
    val client = HealthServices.getClient(context).exerciseClient
    worker.execute {
      try {
        client.setUpdateCallback(callback)
        val capabilities = client.getCapabilitiesAsync().get()
        val type = when {
          ExerciseType.STRENGTH_TRAINING in capabilities.supportedExerciseTypes ->
            ExerciseType.STRENGTH_TRAINING
          ExerciseType.WORKOUT in capabilities.supportedExerciseTypes ->
            ExerciseType.WORKOUT
          else -> return@execute
        }
        val supported = capabilities.getExerciseTypeCapabilities(type).supportedDataTypes
        if (DataType.HEART_RATE_BPM !in supported) return@execute
        client.startExerciseAsync(
          ExerciseConfig(
            exerciseType = type,
            dataTypes = setOf(DataType.HEART_RATE_BPM),
            isAutoPauseAndResumeEnabled = false,
            isGpsEnabled = false,
          )
        ).get()
        if (token != startToken) {
          client.endExerciseAsync().get()
          return@execute
        }
        running = true
        main.post {
          main.removeCallbacks(flushRunnable)
          main.postDelayed(flushRunnable, 60_000)
        }
      } catch (_: Exception) {
        running = false
      }
    }
  }

  private fun stopSampling() {
    startToken++
    if (!running) return
    running = false
    main.removeCallbacks(flushRunnable)
    val context = appContext ?: return
    val client = HealthServices.getClient(context).exerciseClient
    worker.execute {
      try {
        client.endExerciseAsync().get()
      } catch (_: Exception) {
        // Already ended, or it never started.
      }
    }
  }

  private fun flush() {
    val context = appContext ?: return
    val session = sessionId ?: return
    val exercise = exerciseEntryId ?: return
    if (samples.isEmpty()) return
    val batch = samples.toList()
    samples.clear()
    val body = JSONObject()
      .put("type", "heartRateBatch")
      .put("clientId", UUID.randomUUID().toString())
      .put("sessionId", session)
      .put("exerciseEntryId", exercise)
      .put(
        "samples",
        JSONArray().apply {
          batch.forEach { sample ->
            put(JSONObject().put("t", sample.t).put("bpm", sample.bpm))
          }
        }
      )
    val minutes = (System.currentTimeMillis() - shownAt) / 60_000.0
    if (minutes > 0) body.put("durationMinutes", minutes)
    val request = PutDataMapRequest.create("${WearPaths.HEART_RATE}/${body.getString("clientId")}")
    request.dataMap.putString("json", body.toString())
    request.dataMap.putLong("at", System.currentTimeMillis())
    Wearable.getDataClient(context).putDataItem(request.asPutDataRequest().setUrgent())
  }
}
