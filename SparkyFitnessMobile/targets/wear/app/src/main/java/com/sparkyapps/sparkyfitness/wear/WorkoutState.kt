package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/** Paths shared with the phone module `WearLink`. */
internal object WearPaths {
  const val WORKOUT_START = "/sparky/workout/start"
  const val WORKOUT_STOP = "/sparky/workout/stop"
  const val SET_TARGETS = "/sparky/set/targets"
  const val SET_COMPLETED = "/sparky/set/completed"
  const val HEART_RATE = "/sparky/heart-rate"
}

internal data class WearSet(
  val setId: String,
  val exerciseEntryId: String,
  val exerciseName: String,
  val label: String,
  var weightKg: Double?,
  var reps: Double?,
  var done: Boolean = false,
)

internal data class WearPlan(
  val sessionId: String,
  val sets: List<WearSet>,
)

/** What the screen draws for the set the wearer is on. */
internal data class WearScreen(
  val exerciseName: String,
  val label: String,
  val weightText: String,
  val repsText: String,
  /** Epoch ms. Zero when the phone is not resting. */
  val restEndsAtMs: Long = 0L,
  /** The plan is still open and every set is logged. */
  val finished: Boolean = false,
)

/**
 * The live plan. Written from the wearable listener and from the Done
 * button, read by Compose. One plan at a time.
 */
internal object WorkoutHolder {
  var screen by mutableStateOf<WearScreen?>(null)
    private set

  private var appContext: Context? = null
  private var plan: WearPlan? = null

  fun bind(context: Context) {
    appContext = context.applicationContext
  }
  private var revision = 0L
  private var restEndsAtMs = 0L
  private var pendingSetId: String? = null
  private val main = Handler(Looper.getMainLooper())

  fun applyStart(json: JSONObject) {
    val next = parsePlan(json) ?: return
    main.post {
      plan = next
      revision = 0
      restEndsAtMs = 0L
      pendingSetId = null
      publish()
    }
  }

  fun applyStop(sessionId: String) {
    main.post {
      if (plan?.sessionId == sessionId) {
        plan = null
        restEndsAtMs = 0L
        screen = null
        appContext?.let { WearHeartRate.onStop(it) }
      }
    }
  }

  fun applyTargets(json: JSONObject) {
    val sessionId = json.optString("sessionId")
    val nextRevision = json.optNumber("revision")?.toLong() ?: return
    main.post {
      val current = plan ?: return@post
      if (current.sessionId != sessionId || nextRevision <= revision) return@post
      revision = nextRevision
      val byId = current.sets.associateBy { it.setId }
      json.optJSONArray("targets")?.objects()?.forEach { row ->
        val set = byId[row.optString("setId")] ?: return@forEach
        row.optNumber("targetWeightKg")?.let { set.weightKg = it }
        row.optNumber("targetReps")?.let { set.reps = it }
      }
      json.optJSONArray("completedSetIds")?.strings()?.forEach { id ->
        byId[id]?.done = true
      }
      restEndsAtMs = if (json.optString("restState") == "resting") {
        json.optNumber("restEndsAt")?.toLong() ?: 0L
      } else {
        0L
      }
      publish()
    }
  }

  /** Stored locally first, then synced. Success means the phone will get it
   * even if it is out of range right now, so the set can leave the screen. */
  fun complete(context: Context) {
    val current = plan ?: return
    val step = current.sets.firstOrNull { !it.done } ?: return
    if (pendingSetId != null) return
    pendingSetId = step.setId
    val clientId = UUID.randomUUID().toString()
    val body = JSONObject()
      .put("type", "setCompleted")
      .put("clientId", clientId)
      .put("sessionId", current.sessionId)
      .put("setId", step.setId)
      .put("completedAt", Instant.now().toString())
    step.weightKg?.let { body.put("weightKg", it) }
    step.reps?.let { body.put("reps", it) }
    val request = PutDataMapRequest.create("${WearPaths.SET_COMPLETED}/$clientId")
    request.dataMap.putString("json", body.toString())
    request.dataMap.putLong("at", System.currentTimeMillis())
    Wearable.getDataClient(context)
      .putDataItem(request.asPutDataRequest().setUrgent())
      .addOnSuccessListener {
        main.post {
          step.done = true
          pendingSetId = null
          publish()
        }
      }
      .addOnFailureListener {
        main.post { if (pendingSetId == step.setId) pendingSetId = null }
      }
  }

  /** Applies items already synced, in the order the phone wrote them. */
  fun pull(context: Context) {
    val uri = Uri.Builder().scheme("wear").path(WearPaths.PREFIX).build()
    Wearable.getDataClient(context)
      .getDataItems(uri, DataClient.FILTER_PREFIX)
      .addOnSuccessListener { buffer ->
        try {
          val found = mutableListOf<Triple<String, String, Long>>()
          for (i in 0 until buffer.count) {
            val item = buffer.get(i)
            val path = item.uri.path ?: continue
            if (path.startsWith(WearPaths.SET_COMPLETED) || path.startsWith(WearPaths.HEART_RATE)) continue
            val map = DataMapItem.fromDataItem(item).dataMap
            val json = map.getString("json") ?: continue
            found.add(Triple(path, json, map.getLong("at")))
          }
          found.sortedBy { it.third }.forEach { (path, json, _) ->
            val body = JSONObject(json)
            when (path) {
              WearPaths.WORKOUT_START -> applyStart(body)
              WearPaths.WORKOUT_STOP -> applyStop(body.optString("sessionId"))
              WearPaths.SET_TARGETS -> applyTargets(body)
            }
          }
        } finally {
          buffer.release()
        }
      }
  }

  private fun publish() {
    val current = plan
    val step = current?.sets?.firstOrNull { !it.done }
    screen = when {
      current == null -> null
      step == null -> WearScreen("", "", "", "", finished = true)
      else -> WearScreen(
        exerciseName = step.exerciseName,
        label = step.label,
        weightText = formatNumber(step.weightKg),
        repsText = formatNumber(step.reps),
        restEndsAtMs = restEndsAtMs,
      )
    }
    val ctx = appContext
    val entry = step?.exerciseEntryId ?: current?.sets?.lastOrNull()?.exerciseEntryId
    if (ctx == null) return
    if (current == null || entry.isNullOrEmpty()) WearHeartRate.onStop(ctx)
    else WearHeartRate.onExercise(ctx, current.sessionId, entry)
  }
}

internal fun parsePlan(json: JSONObject): WearPlan? {
  val sessionId = json.optString("sessionId")
  if (sessionId.isEmpty()) return null
  val exercises = json.optJSONArray("exercises")?.objects().orEmpty()
  val lookup = linkedMapOf<String, WearSet>()
  exercises.forEach { exercise ->
    val name = exercise.optString("name").ifEmpty { "Exercise" }
    val entryId = exercise.optString("exerciseEntryId")
    val sets = exercise.optJSONArray("sets")?.objects().orEmpty()
    sets.forEachIndexed { index, set ->
      val setId = set.optString("setId")
      if (setId.isEmpty()) return@forEachIndexed
      lookup[setId] = WearSet(
        setId = setId,
        exerciseEntryId = entryId,
        exerciseName = name,
        label = setLabel(set.optString("setType"), index + 1, sets.size),
        weightKg = set.optNumber("targetWeightKg"),
        reps = set.optNumber("targetReps"),
      )
    }
  }
  val order = json.optJSONArray("setOrder")?.strings().orEmpty()
  val sets = if (order.isEmpty()) lookup.values.toList() else order.mapNotNull { lookup[it] }
  if (sets.isEmpty()) return null
  return WearPlan(sessionId, sets)
}

private fun setLabel(setType: String, number: Int, count: Int): String {
  val kind = when (setType.lowercase()) {
    "warmup" -> "Warmup"
    "drop" -> "Drop"
    "failure" -> "Failure"
    else -> "Set"
  }
  return "$kind $number/$count"
}

private fun formatNumber(value: Double?): String {
  if (value == null) return "–"
  return if (value % 1.0 == 0.0) value.toInt().toString() else String.format("%.1f", value)
}

private fun JSONObject.optNumber(key: String): Double? {
  if (!has(key) || isNull(key)) return null
  return when (val value = get(key)) {
    is Number -> value.toDouble()
    else -> null
  }
}

private fun JSONArray.objects(): List<JSONObject> =
  List(length()) { index -> optJSONObject(index) }.filterNotNull()

private fun JSONArray.strings(): List<String> =
  List(length()) { index -> optString(index) }.filter { it.isNotEmpty() }
