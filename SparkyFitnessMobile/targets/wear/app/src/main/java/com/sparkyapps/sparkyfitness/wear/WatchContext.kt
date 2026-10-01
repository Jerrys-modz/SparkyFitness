package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.util.UUID

internal data class WaterContainer(val id: Int, val name: String, val servingMl: Double)
internal data class DrinkRow(val id: String, val name: String, val volumeMl: Double, val time: String)
internal data class PendingTap(val clientId: String, val ml: Double, val day: String)

internal data class WatchSnapshot(
  val today: String = "",
  val unit: String = "kg",
  val todayWeightKg: Double? = null,
  val lastWeightKg: Double? = null,
  val todayBodyFat: Double? = null,
  val lastBodyFat: Double? = null,
  val history: List<Pair<String, Double>> = emptyList(),
  val caloriesConsumed: Int? = null,
  val caloriesBurned: Int? = null,
  val caloriesRemaining: Int? = null,
  val proteinConsumed: Int? = null,
  val proteinGoal: Int? = null,
  val carbsConsumed: Int? = null,
  val carbsGoal: Int? = null,
  val fatConsumed: Int? = null,
  val fatGoal: Int? = null,
  /** Resting burn for the day, kcal. Used to strip it out of a workout. */
  val bmrKcal: Double? = null,
  val containers: List<WaterContainer> = emptyList(),
  val waterMl: Double = 0.0,
  val waterGoalMl: Double = 0.0,
  val waterUnit: String = "ml",
  val drinks: List<DrinkRow> = emptyList(),
  val acked: Set<String> = emptySet(),
  val failed: Set<String> = emptySet(),
)

/** The phone's latest context, plus taps not confirmed yet. */
internal object WatchContext {
  var snapshot by mutableStateOf(WatchSnapshot())
    private set
  var pending by mutableStateOf(listOf<PendingTap>())
    private set

  fun apply(json: JSONObject) {
    val history = json.optJSONArray("history")?.objects().orEmpty().mapNotNull { row ->
      val day = row.optString("day")
      val weight = row.optNumber("weightKg") ?: return@mapNotNull null
      if (day.isEmpty()) null else day to weight
    }
    val containers = json.optJSONArray("containers")?.objects().orEmpty().mapNotNull { row ->
      val id = row.optInt("id", -1)
      if (id < 0) return@mapNotNull null
      WaterContainer(id, row.optString("name"), row.optNumber("servingVolumeMl") ?: 0.0)
    }
    val drinks = json.optJSONArray("waterLog")?.objects().orEmpty().mapNotNull { row ->
      val id = row.optString("id")
      if (id.isEmpty()) return@mapNotNull null
      DrinkRow(id, row.optString("name"), row.optNumber("volumeMl") ?: 0.0, row.optString("time"))
    }
    val acked = json.optJSONArray("ackedClientIds")?.strings()?.toSet().orEmpty()
    val failed = json.optJSONArray("failedClientIds")?.strings()?.toSet().orEmpty()
    val next = WatchSnapshot(
      today = json.optString("today"),
      unit = json.optString("weightUnit").ifEmpty { "kg" },
      todayWeightKg = json.optNumber("todayWeightKg"),
      lastWeightKg = json.optNumber("lastWeightKg"),
      todayBodyFat = json.optNumber("todayBodyFatPercentage"),
      lastBodyFat = json.optNumber("lastBodyFatPercentage"),
      history = history,
      caloriesConsumed = json.optNumber("caloriesConsumed")?.toInt(),
      caloriesBurned = json.optNumber("caloriesBurned")?.toInt(),
      caloriesRemaining = json.optNumber("caloriesRemaining")?.toInt(),
      proteinConsumed = json.optNumber("proteinConsumed")?.toInt(),
      proteinGoal = json.optNumber("proteinGoal")?.toInt(),
      carbsConsumed = json.optNumber("carbsConsumed")?.toInt(),
      carbsGoal = json.optNumber("carbsGoal")?.toInt(),
      fatConsumed = json.optNumber("fatConsumed")?.toInt(),
      fatGoal = json.optNumber("fatGoal")?.toInt(),
      bmrKcal = json.optNumber("bmrKcal")?.takeIf { it > 0 },
      containers = containers,
      waterMl = json.optNumber("waterConsumedMl") ?: 0.0,
      waterGoalMl = json.optNumber("waterGoalMl") ?: 0.0,
      waterUnit = json.optString("waterDisplayUnit").ifEmpty { "ml" },
      drinks = drinks,
      acked = acked,
      failed = failed,
    )
    Handler(Looper.getMainLooper()).post {
      snapshot = next
      pending = pending.filter { it.clientId !in acked && it.clientId !in failed && it.day == next.today }
    }
  }

  fun seedWeightKg(): Double = snapshot.todayWeightKg ?: snapshot.lastWeightKg ?: 80.0

  fun displayWeight(kg: Double): Double =
    if (snapshot.unit == "lbs") kg * 2.2046226218 else kg

  fun toKg(display: Double): Double =
    if (snapshot.unit == "lbs") display / 2.2046226218 else display
}

internal object PhoneBus {
  fun requestContext(context: Context) {
    put(context, "/sparky/request-context", JSONObject().put("type", "requestContext"))
  }

  fun checkIn(context: Context, weightKg: Double, bodyFat: Double?) {
    val id = UUID.randomUUID().toString()
    val body = JSONObject()
      .put("type", "checkIn")
      .put("clientId", id)
      .put("entryDate", LocalDate.now().toString())
      .put("weightKg", weightKg)
    if (bodyFat != null) body.put("bodyFatPercentage", bodyFat)
    put(context, "/sparky/check-in/$id", body)
  }

  fun water(context: Context, container: WaterContainer) {
    val id = UUID.randomUUID().toString()
    val day = LocalDate.now().toString()
    put(
      context,
      "/sparky/water/$id",
      JSONObject()
        .put("type", "waterIntake")
        .put("clientId", id)
        .put("entryDate", day)
        .put("containerId", container.id),
    )
    WatchContext.pending = WatchContext.pending + PendingTap(id, container.servingMl, day)
  }

  fun deleteDrink(context: Context, entryId: String) {
    val id = UUID.randomUUID().toString()
    put(
      context,
      "/sparky/water-delete/$id",
      JSONObject().put("type", "waterDelete").put("clientId", id).put("entryId", entryId),
    )
  }

  fun rest(context: Context, sessionId: String, previousEndsAt: Long, endsAt: Long?) {
    val id = UUID.randomUUID().toString()
    val body = JSONObject()
      .put("type", "restChanged")
      .put("clientId", id)
      .put("sessionId", sessionId)
      .put("previousEndsAt", previousEndsAt)
    if (endsAt != null) body.put("endsAt", endsAt)
    put(context, "/sparky/rest/$id", body)
  }

  fun workoutStopped(context: Context, sessionId: String) {
    val id = UUID.randomUUID().toString()
    put(
      context,
      "/sparky/workout/stopped/$id",
      JSONObject().put("type", "workoutStop").put("clientId", id).put("sessionId", sessionId),
    )
  }

  private fun put(context: Context, path: String, body: JSONObject) {
    val request = PutDataMapRequest.create(path)
    request.dataMap.putString("json", body.toString())
    request.dataMap.putLong("at", System.currentTimeMillis())
    Wearable.getDataClient(context).putDataItem(request.asPutDataRequest().setUrgent())
  }
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
