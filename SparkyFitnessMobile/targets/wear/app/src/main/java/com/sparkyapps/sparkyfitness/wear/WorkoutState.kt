package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID

/** Paths shared with the phone module `WearLink`. */
internal object WearPaths {
  const val WORKOUT_START = "/sparky/workout/start"
  const val WORKOUT_STOP = "/sparky/workout/stop"
  const val SET_TARGETS = "/sparky/set/targets"
  const val SET_COMPLETED = "/sparky/set/completed"
}

internal data class WearSet(
  val setId: String,
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
)

/**
 * The live plan. Written from the wearable listener and from the Done
 * button, read by Compose. One plan at a time.
 */
internal object WorkoutHolder {
  var screen by mutableStateOf<WearScreen?>(null)
    private set

  private var plan: WearPlan? = null
  private var revision = 0L
  private val main = Handler(Looper.getMainLooper())

  fun applyStart(json: JSONObject) {
    val next = parsePlan(json) ?: return
    main.post {
      plan = next
      revision = 0
      publish()
    }
  }

  fun applyStop(sessionId: String) {
    main.post {
      if (plan?.sessionId == sessionId) {
        plan = null
        screen = null
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
      publish()
    }
  }

  fun complete(context: Context) {
    val current = plan ?: return
    val step = current.sets.firstOrNull { !it.done } ?: return
    val body = JSONObject()
      .put("type", "setCompleted")
      .put("clientId", UUID.randomUUID().toString())
      .put("sessionId", current.sessionId)
      .put("setId", step.setId)
      .put("completedAt", Instant.now().toString())
    step.weightKg?.let { body.put("weightKg", it) }
    step.reps?.let { body.put("reps", it) }
    val bytes = body.toString().toByteArray(StandardCharsets.UTF_8)
    Wearable.getNodeClient(context).connectedNodes.addOnSuccessListener { nodes ->
      val client = Wearable.getMessageClient(context)
      nodes.forEach { node ->
        client.sendMessage(node.id, WearPaths.SET_COMPLETED, bytes)
      }
    }
    step.done = true
    publish()
  }

  private fun publish() {
    val step = plan?.sets?.firstOrNull { !it.done }
    screen = step?.let {
      WearScreen(
        exerciseName = it.exerciseName,
        label = it.label,
        weightText = formatNumber(it.weightKg),
        repsText = formatNumber(it.reps),
      )
    }
  }
}

internal fun parsePlan(json: JSONObject): WearPlan? {
  val sessionId = json.optString("sessionId")
  if (sessionId.isEmpty()) return null
  val exercises = json.optJSONArray("exercises")?.objects().orEmpty()
  val lookup = linkedMapOf<String, WearSet>()
  exercises.forEach { exercise ->
    val name = exercise.optString("name").ifEmpty { "Exercise" }
    val sets = exercise.optJSONArray("sets")?.objects().orEmpty()
    sets.forEachIndexed { index, set ->
      val setId = set.optString("setId")
      if (setId.isEmpty()) return@forEachIndexed
      lookup[setId] = WearSet(
        setId = setId,
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
