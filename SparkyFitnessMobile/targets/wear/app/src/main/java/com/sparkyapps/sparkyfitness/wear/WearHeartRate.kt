package com.sparkyapps.sparkyfitness.wear

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
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
import java.io.File
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/**
 * Samples heart rate and workout calories for the exercise on screen.
 * Resting burn is taken off using the day's BMR from the phone, so the
 * batch matches the Apple Watch's active calories. One exercise at a time.
 */
internal object WearHeartRate {
  private const val TAG = "WearHeartRate"

  var bpm by mutableIntStateOf(0)
    private set
  /** Whole-workout calories, or -1 before the first reading. */
  var kcal by mutableIntStateOf(-1)
    private set
  var permissionNeeded by mutableStateOf(false)
    private set

  /** Screenshot job. Does not start sampling. */
  fun show(bpm: Int, kcal: Int) {
    this.bpm = bpm
    this.kcal = kcal
  }

  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private val samples = ArrayDeque<Sample>()
  private val seen = LinkedHashSet<String>()
  private var appContext: Context? = null
  private var sessionId: String? = null
  private var exerciseEntryId: String? = null
  private var shownAt = 0L
  /** Running total from Health Services, resting included. */
  private var rawTotalKcal: Double? = null
  /** Active calories already sent. Resting is never included. */
  private var reportedActiveKcal = 0.0
  /** When this exercise session began, for the resting subtraction. */
  private var exerciseStartedAt = 0L
  @Volatile private var running = false
  @Volatile private var startToken = 0
  private var asked = false

  private data class Sample(val t: String, val bpm: Int)

  private val callback = object : ExerciseUpdateCallback {
    override fun onRegistered() {}

    override fun onRegistrationFailed(throwable: Throwable) {}

    override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
      val boot = Instant.ofEpochMilli(
        System.currentTimeMillis() - SystemClock.elapsedRealtime()
      )
      val points = try {
        if (DataType.HEART_RATE_BPM in update.latestMetrics.dataTypes) {
          update.latestMetrics.getData(DataType.HEART_RATE_BPM)
        } else {
          emptyList()
        }
      } catch (_: Exception) {
        emptyList()
      }
      val reading = try {
        if (DataType.CALORIES_TOTAL in update.latestMetrics.dataTypes) {
          update.latestMetrics.getData(DataType.CALORIES_TOTAL)?.total
        } else {
          null
        }
      } catch (_: Exception) {
        null
      }
      val token = startToken
      main.post {
        if (token != startToken || sessionId == null) return@post
        if (reading != null) {
          val previous = rawTotalKcal
          if (previous != null && reading + 0.01 < previous) {
            calorieEpoch += 1
            reportedActiveKcal = 0.0
            exerciseStartedAt = System.currentTimeMillis()
          }
          rawTotalKcal = reading
          kcal = activeKcal()?.roundToInt() ?: -1
        }
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
    drainOutbox()
    if (session != sessionId) {
      // A flush still in flight belongs to the previous workout. Its
      // completion must not run finishStopped against this one.
      generation++
      stopAfterFlush = false
    }
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
    drainOutbox()
    if (sessionId == null && !flushing) {
      stopSampling()
      return
    }
    bpm = 0
    kcal = -1
    stopAfterFlush = true
    stopRetry = false
    flush()
    if (!flushing) finishStopped()
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
        val types = buildSet {
          if (DataType.HEART_RATE_BPM in supported) add(DataType.HEART_RATE_BPM)
          if (DataType.CALORIES_TOTAL in supported) add(DataType.CALORIES_TOTAL)
        }
        if (types.isEmpty()) return@execute
        client.startExerciseAsync(
          ExerciseConfig(
            exerciseType = type,
            dataTypes = types,
            isAutoPauseAndResumeEnabled = false,
            isGpsEnabled = false,
          )
        ).get()
        if (token != startToken) {
          client.endExerciseAsync().get()
          return@execute
        }
        running = true
        val started = System.currentTimeMillis()
        main.post {
          if (token != startToken) return@post
          exerciseStartedAt = started
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

  private var flushing = false
  private var flushAgain = false
  private var stopAfterFlush = false
  private var stopRetry = false
  private var generation = 0
  private var inflightId: String? = null
  private var calorieEpoch = 0

  /** The phone named a different server config. Send only this config's batches. */
  fun onOwner() {
    drainOutbox()
    if (sessionId != null) flush()
  }

  private fun flush() {
    if (flushing) {
      flushAgain = true
      return
    }
    val context = appContext ?: return
    val session = sessionId ?: return
    val exercise = exerciseEntryId ?: return
    val batch = samples.toList()
    val cumulative = activeKcal()
    val delta = cumulative?.let { kotlin.math.max(0.0, it - reportedActiveKcal) }
    val minutes = (System.currentTimeMillis() - shownAt) / 60_000.0
    if (batch.isEmpty() && (delta == null || delta == 0.0) && minutes <= 0) return
    val owner = WatchContext.snapshot.ownerId
    if (owner.isEmpty()) return
    val epoch = calorieEpoch
    val flushGeneration = generation
    val stopping = stopAfterFlush
    val body = JSONObject()
      .put("type", "heartRateBatch")
      .put("clientId", UUID.randomUUID().toString())
      .put("sessionId", session)
      .put("exerciseEntryId", exercise)
      .put("ownerId", owner)
      .put(
        "samples",
        JSONArray().apply {
          batch.forEach { sample ->
            put(JSONObject().put("t", sample.t).put("bpm", sample.bpm))
          }
        }
      )
    if (delta != null) body.put("activeEnergyKcal", delta)
    if (minutes > 0) body.put("durationMinutes", minutes)
    val clientId = body.getString("clientId")
    if (!stage(body)) return
    flushing = true
    samples.clear()
    inflightId = clientId
    val request = PutDataMapRequest.create("${WearPaths.HEART_RATE}/$clientId")
    request.dataMap.putString("json", body.toString())
    request.dataMap.putLong("at", System.currentTimeMillis())
    val task = Wearable.getDataClient(context).putDataItem(request.asPutDataRequest().setUrgent())
    task.addOnSuccessListener {
      main.post {
        if (inflightId == clientId) inflightId = null
        dropStaged(clientId)
        if (flushGeneration == generation && epoch == calorieEpoch && cumulative != null && delta != null) {
          reportedActiveKcal = cumulative
        }
        afterFlush(true, flushGeneration, stopping)
      }
    }
    task.addOnFailureListener {
      main.post {
        if (inflightId == clientId) inflightId = null
        if (flushGeneration == generation) {
          dropStaged(clientId)
          batch.asReversed().forEach { sample -> samples.addFirst(sample) }
        } else if (body.optString("ownerId") == WatchContext.snapshot.ownerId) {
          putStaged(body.toString())
        }
        afterFlush(false, flushGeneration, stopping)
      }
    }
  }

  /** Writes the batch aside, then renames it into place. False leaves the
   * in-memory samples where they are. */
  private fun stage(body: JSONObject): Boolean {
    val context = appContext ?: return false
    val dir = File(context.filesDir, "wear-hr-outbox")
    if (!dir.isDirectory && !dir.mkdirs()) return false
    val clientId = body.getString("clientId")
    val temp = File(dir, "$clientId.json.tmp")
    val dest = File(dir, "$clientId.json")
    return try {
      temp.writeText(body.toString())
      if (!temp.renameTo(dest)) {
        temp.copyTo(dest, overwrite = true)
        temp.delete()
      }
      val ready = dest.isFile && dest.length() > 0
      if (!ready) dest.delete()
      ready
    } catch (error: Exception) {
      temp.delete()
      dest.delete()
      Log.w(TAG, "outbox stage failed", error)
      false
    }
  }

  private fun dropStaged(clientId: String) {
    val context = appContext ?: return
    File(context.filesDir, "wear-hr-outbox/$clientId.json").delete()
  }

  private fun drainOutbox() {
    val context = appContext ?: return
    val owner = WatchContext.snapshot.ownerId
    val dir = File(context.filesDir, "wear-hr-outbox")
    dir.listFiles()?.forEach { candidate ->
      if (!candidate.isFile || candidate.name.endsWith(".bad")) return@forEach
      val file = if (candidate.name.endsWith(".json.tmp")) {
        val promoted = File(candidate.parentFile, candidate.name.removeSuffix(".tmp"))
        if (!candidate.renameTo(promoted)) {
          Log.w(TAG, "outbox promote failed ${candidate.name}")
          return@forEach
        }
        promoted
      } else if (candidate.name.endsWith(".json")) {
        candidate
      } else {
        return@forEach
      }
      if (file.nameWithoutExtension == inflightId) return@forEach
      val json = try {
        file.readText()
      } catch (error: Exception) {
        Log.w(TAG, "outbox unreadable ${file.name}", error)
        return@forEach
      }
      val body = try {
        JSONObject(json)
      } catch (error: Exception) {
        quarantine(file, error)
        return@forEach
      }
      val clientId = body.optString("clientId")
      val fileOwner = body.optString("ownerId")
      if (clientId.isEmpty() || fileOwner.isEmpty()) {
        quarantine(file, IllegalStateException("missing owner"))
        return@forEach
      }
      if (owner.isEmpty() || fileOwner != owner) return@forEach
      putStaged(json)
    }
  }

  private fun quarantine(file: File, error: Exception) {
    val bad = File(file.parentFile, "${file.nameWithoutExtension}.bad")
    if (!file.renameTo(bad)) {
      Log.w(TAG, "outbox quarantine failed ${file.name}", error)
    } else {
      Log.w(TAG, "outbox quarantined ${file.name}", error)
    }
  }

  private val retrying = HashSet<String>()

  private fun putStaged(json: String) {
    val context = appContext ?: return
    val body = try {
      JSONObject(json)
    } catch (error: Exception) {
      Log.w(TAG, "outbox replay skipped", error)
      return
    }
    val clientId = body.optString("clientId")
    val fileOwner = body.optString("ownerId")
    if (clientId.isEmpty() || fileOwner.isEmpty() || fileOwner != WatchContext.snapshot.ownerId) {
      return
    }
    if (!retrying.add(clientId)) return
    val request = PutDataMapRequest.create("${WearPaths.HEART_RATE}/$clientId")
    request.dataMap.putString("json", json)
    request.dataMap.putLong("at", System.currentTimeMillis())
    val task = Wearable.getDataClient(context).putDataItem(request.asPutDataRequest().setUrgent())
    task.addOnSuccessListener {
      main.post {
        retrying.remove(clientId)
        dropStaged(clientId)
      }
    }
    task.addOnFailureListener {
      main.post {
        retrying.remove(clientId)
        main.postDelayed({ putStaged(json) }, 15_000)
      }
    }
  }

  private fun afterFlush(success: Boolean, flushGeneration: Int, stopping: Boolean) {
    flushing = false
    val stillCurrent = flushGeneration == generation
    if (flushAgain && sessionId != null && stillCurrent) {
      flushAgain = false
      flush()
      if (!flushing && stopping && success && stopAfterFlush) finishStopped()
      return
    }
    if (stopping && stillCurrent && stopAfterFlush && success) {
      finishStopped()
      return
    }
    // A failed stop write requeued the batch. Try once more; a second
    // failure leaves the samples queued instead of wiping them.
    if (stopping && stillCurrent && stopAfterFlush && !stopRetry) {
      stopRetry = true
      flush()
    }
  }

  private fun finishStopped() {
    stopAfterFlush = false
    stopRetry = false
    flushAgain = false
    sessionId = null
    exerciseEntryId = null
    bpm = 0
    kcal = -1
    rawTotalKcal = null
    reportedActiveKcal = 0.0
    exerciseStartedAt = 0L
    samples.clear()
    stopSampling()
  }

  /**
   * Workout calories with resting removed. Null until Health Services has a
   * total and the phone has sent today's resting burn, so a total is never
   * reported as active.
   */
  private fun activeKcal(): Double? {
    val total = rawTotalKcal ?: return null
    val bmr = WatchContext.snapshot.bmrKcal ?: return null
    if (bmr <= 0 || exerciseStartedAt <= 0L) return null
    val elapsedSec = (System.currentTimeMillis() - exerciseStartedAt) / 1000.0
    val resting = bmr / 86_400.0 * elapsedSec
    return kotlin.math.max(0.0, total - resting)
  }
}
