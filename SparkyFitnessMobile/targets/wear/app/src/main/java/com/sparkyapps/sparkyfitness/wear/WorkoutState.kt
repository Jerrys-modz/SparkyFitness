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
  const val PREFIX = "/sparky"
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
  val restSeconds: Int,
  var weightKg: Double?,
  var reps: Double?,
  val supersetRun: Int? = null,
  var done: Boolean = false,
)

internal data class WearPlan(
  val sessionId: String,
  val sets: List<WearSet>,
)

internal data class WearScreen(
  val exerciseName: String,
  val label: String,
  val weightKg: Double?,
  val reps: Double?,
  val superset: String? = null,
  val supersetRun: Int? = null,
  /** Epoch ms. Zero when the phone is not resting. */
  val restEndsAtMs: Long = 0L,
  /** Planned length of this rest, so the bar can fill as it runs down. */
  val restTotalMs: Long = 0L,
  /** The plan is still open and every set is logged. */
  val finished: Boolean = false,
)

internal data class ExerciseRow(
  val id: String,
  val name: String,
  val done: Int,
  val total: Int,
  val supersetRun: Int? = null,
)

/**
 * The live plan. Written from the wearable listener and from the Done
 * button, read by Compose. One plan at a time.
 */
internal object WorkoutHolder {
  var screen by mutableStateOf<WearScreen?>(null)
    private set
  var listing by mutableStateOf(false)
    private set

  private var appContext: Context? = null
  private var plan: WearPlan? = null

  fun workoutStartedAt(): Long = startedAtMs

  fun bind(context: Context) {
    appContext = context.applicationContext
  }

  /** Screenshot job only. Does not start heart-rate sampling. */
  fun seed(plan: WearPlan, mode: String) {
    this.plan = plan
    val resting = mode == "resting" && plan.sets.size > 1
    if (resting) plan.sets[0].done = true
    cursor = if (resting) 1 else 0
    restEndsAtMs = if (mode == "resting") System.currentTimeMillis() + 82_000 else 0L
    restTotalMs = if (mode == "resting") 97_000 else 0L
    startedAtMs = System.currentTimeMillis() - 8_000
    val step = plan.sets[cursor]
    screen = WearScreen(
      exerciseName = step.exerciseName,
      label = step.label,
      weightKg = step.weightKg,
      reps = step.reps,
      restEndsAtMs = restEndsAtMs,
      restTotalMs = restTotalMs,
      superset = partnersOf(plan, step),
      supersetRun = step.supersetRun,
    )
    listing = mode == "exercises"
  }

  fun clearScreen() {
    plan = null
    screen = null
    listing = false
    restEndsAtMs = 0L
    restTotalMs = 0L
  }
  private var revision = 0L
  private var restEndsAtMs = 0L
  private var restTotalMs = 0L
  private var startedAtMs = 0L
  private var cursor = 0
  private var pendingSetId: String? = null
  private val main = Handler(Looper.getMainLooper())

  fun applyStart(json: JSONObject) {
    val next = parsePlan(json) ?: return
    main.post {
      plan = next
      revision = 0
      restEndsAtMs = 0L
      restTotalMs = 0L
      startedAtMs = runCatching { Instant.parse(json.optString("startedAt")).toEpochMilli() }
        .getOrDefault(System.currentTimeMillis())
      cursor = 0
      listing = false
      pendingSetId = null
      publish()
    }
  }

  fun applyStop(sessionId: String) {
    main.post {
      if (plan?.sessionId == sessionId) {
        plan = null
        restEndsAtMs = 0L
        restTotalMs = 0L
        cursor = 0
        listing = false
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
      val sets = current.sets
      if (sets.getOrNull(cursor)?.done == true) {
        cursor = sets.indexOfFirst { !it.done }.takeIf { it >= 0 } ?: sets.size
      }
      restEndsAtMs = if (json.optString("restState") == "resting") {
        json.optNumber("restEndsAt")?.toLong() ?: 0L
      } else {
        0L
      }
      if (restEndsAtMs <= 0L) {
        restTotalMs = 0L
      } else if (restTotalMs <= 0L) {
        val planned = (sets.getOrNull(cursor)?.restSeconds ?: 0) * 1000L
        restTotalMs = if (planned > 0) planned else (restEndsAtMs - System.currentTimeMillis()).coerceAtLeast(1L)
      }
      publish()
    }
  }

  /** Stored locally first, then synced. Success means the phone will get it
   * even if it is out of range right now, so the set can leave the screen. */
  fun complete(context: Context) {
    val current = plan ?: return
    val step = current.sets.getOrNull(cursor) ?: return
    if (step.done || pendingSetId != null) return
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
          val next = current.sets.indexOfFirst { !it.done }
          if (next >= 0) {
            cursor = next
            val rest = current.sets[next].restSeconds
            restTotalMs = if (rest > 0) rest * 1000L else 0L
            restEndsAtMs = if (rest > 0) System.currentTimeMillis() + restTotalMs else 0L
          } else {
            cursor = current.sets.size
            restEndsAtMs = 0L
            restTotalMs = 0L
          }
          publish()
        }
      }
      .addOnFailureListener {
        main.post { if (pendingSetId == step.setId) pendingSetId = null }
      }
  }

  fun setField(weightKg: Double?, reps: Double?) {
    val step = plan?.sets?.getOrNull(cursor) ?: return
    if (step.done) return
    if (weightKg != null) step.weightKg = weightKg.coerceAtLeast(0.0)
    if (reps != null) step.reps = reps.coerceAtLeast(0.0)
    publish()
  }

  fun previous() {
    if (cursor <= 0) return
    restEndsAtMs = 0L
    restTotalMs = 0L
    cursor -= 1
    publish()
  }

  fun nextStep() {
    val sets = plan?.sets ?: return
    if (cursor + 1 >= sets.size) return
    restEndsAtMs = 0L
    restTotalMs = 0L
    cursor += 1
    publish()
  }

  fun showExercises(show: Boolean) {
    listing = show
  }

  fun jumpTo(entryId: String) {
    val sets = plan?.sets ?: return
    val index = sets.indexOfFirst { it.exerciseEntryId == entryId && !it.done }
      .takeIf { it >= 0 }
      ?: sets.indexOfFirst { it.exerciseEntryId == entryId }
    if (index < 0) return
    cursor = index
    restEndsAtMs = 0L
    restTotalMs = 0L
    listing = false
    publish()
  }

  fun exercises(): List<ExerciseRow> {
    val sets = plan?.sets ?: return emptyList()
    return sets.groupBy { it.exerciseEntryId }.map { (id, group) ->
      ExerciseRow(
        id,
        group.first().exerciseName,
        group.count { it.done },
        group.size,
        group.first().supersetRun,
      )
    }
  }

  fun skipRest(context: Context) {
    val session = plan?.sessionId ?: return
    val previous = restEndsAtMs
    if (previous <= 0L) return
    restEndsAtMs = 0L
    restTotalMs = 0L
    PhoneBus.rest(context, session, previous, null)
    publish()
  }

  fun adjustRest(context: Context, deltaSeconds: Int) {
    val previous = restEndsAtMs
    if (previous <= System.currentTimeMillis()) return
    val next = previous + deltaSeconds * 1000L
    if (next <= System.currentTimeMillis()) {
      skipRest(context)
      return
    }
    restEndsAtMs = next
    restTotalMs = (restTotalMs + deltaSeconds * 1000L).coerceAtLeast(1L)
    val session = plan?.sessionId ?: return
    PhoneBus.rest(context, session, previous, next)
    publish()
  }

  fun finish(context: Context) {
    val session = plan?.sessionId ?: return
    PhoneBus.workoutStopped(context, session)
    plan = null
    restEndsAtMs = 0L
    restTotalMs = 0L
    cursor = 0
    listing = false
    screen = null
    WearHeartRate.onStop(context)
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
            val body = try {
              JSONObject(json)
            } catch (_: Exception) {
              return@forEach
            }
            when (path) {
              WearPaths.WORKOUT_START -> applyStart(body)
              WearPaths.WORKOUT_STOP -> applyStop(body.optString("sessionId"))
              WearPaths.SET_TARGETS -> applyTargets(body)
              "/sparky/context" -> WatchContext.apply(body)
            }
          }
        } finally {
          buffer.release()
        }
      }
  }

  private fun publish() {
    val current = plan
    val step = current?.sets?.getOrNull(cursor)
    screen = when {
      current == null -> null
      step == null -> WearScreen("", "", null, null, finished = true)
      else -> WearScreen(
        exerciseName = step.exerciseName,
        label = step.label,
        weightKg = step.weightKg,
        reps = step.reps,
        superset = partnersOf(current, step),
        supersetRun = step.supersetRun,
        restEndsAtMs = restEndsAtMs,
        restTotalMs = restTotalMs,
      )
    }
    val ctx = appContext
    val entry = step?.exerciseEntryId ?: current?.sets?.lastOrNull()?.exerciseEntryId
    if (ctx == null) return
    if (current == null || step == null || entry.isNullOrEmpty()) WearHeartRate.onStop(ctx)
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
        restSeconds = set.optInt("restSeconds"),
        supersetRun = exercise.optNumber("supersetRun")?.toInt(),
      )
    }
  }
  val order = json.optJSONArray("setOrder")?.strings().orEmpty()
  val sets = if (order.isEmpty()) lookup.values.toList() else order.mapNotNull { lookup[it] }
  if (sets.isEmpty()) return null
  return WearPlan(sessionId, sets)
}

private fun partnersOf(plan: WearPlan, step: WearSet): String? {
  val run = step.supersetRun ?: return null
  val names = plan.sets
    .filter { it.supersetRun == run && it.exerciseEntryId != step.exerciseEntryId }
    .map { it.exerciseName }
    .distinct()
  return names.takeIf { it.isNotEmpty() }?.joinToString(", ")
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
