package com.sparkyapps.sparkyfitness.wear

import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/**
 * Fills the pages for the CI screenshot job. A Wear emulator has no paired
 * phone, so without this every page is the empty "not synced yet" state.
 * Only the debug build has it, and it runs only when the launch extra is set.
 */
internal object ScreenshotSeed {
  fun apply(intent: Intent) {
    if (intent.getStringExtra("sparky.screenshot") != "1") return
    WatchContext.replace(sample())
    val workout = intent.getStringExtra("sparky.workout") ?: "none"
    if (workout == "none") {
      WorkoutHolder.clearScreen()
      WearHeartRate.show(0, -1)
      return
    }
    val plan = parsePlan(samplePlan()) ?: return
    WorkoutHolder.seed(plan, workout)
    WearHeartRate.show(142, 86)
  }

  private fun sample(): WatchSnapshot {
    val today = LocalDate.now()
    val weights = listOf(82.4, 82.1, null, 81.9, 81.6, 81.4, null, 81.1, 80.9, 80.7)
    val history = weights.mapIndexedNotNull { index, weight ->
      weight?.let { today.minusDays((weights.size - 1 - index).toLong()).toString() to it }
    }
    return WatchSnapshot(
      today = today.toString(),
      unit = "kg",
      todayWeightKg = 80.7,
      lastWeightKg = 80.9,
      todayBodyFat = 18.8,
      lastBodyFat = 18.9,
      history = history,
      caloriesConsumed = 2154,
      caloriesBurned = 788,
      caloriesRemaining = -254,
      proteinConsumed = 112,
      proteinGoal = 179,
      carbsConsumed = 136,
      carbsGoal = 150,
      fatConsumed = 66,
      fatGoal = 60,
      bmrKcal = 1700.0,
      containers = listOf(
        WaterContainer(1, "Glass", 250.0),
        WaterContainer(2, "Bottle", 500.0),
        WaterContainer(3, "Large flask", 750.0),
      ),
      waterMl = 1500.0,
      waterGoalMl = 2500.0,
      waterUnit = "liter",
      drinks = listOf(
        DrinkRow("w3", "Bottle", 500.0, "14:20"),
        DrinkRow("w2", "Glass", 250.0, "11:05"),
        DrinkRow("w1", "Large flask", 750.0, "08:40"),
      ),
    )
  }

  private fun samplePlan(): JSONObject {
    fun set(id: String, reps: Int, weight: Double?, rest: Int, type: String): JSONObject {
      val row = JSONObject()
        .put("setId", id)
        .put("targetReps", reps)
        .put("restSeconds", rest)
        .put("setType", type)
      if (weight != null) row.put("targetWeightKg", weight)
      return row
    }
    fun exercise(id: String, name: String, sets: JSONArray) = JSONObject()
      .put("exerciseEntryId", id)
      .put("name", name)
      .put("sets", sets)
    return JSONObject()
      .put("sessionId", "preview-session")
      .put(
        "exercises",
        JSONArray()
          .put(
            exercise(
              "preview-ex-1",
              "Barbell Bench Press",
              JSONArray()
                .put(set("1", 10, 40.0, 60, "warmup"))
                .put(set("2", 8, 70.0, 90, "normal"))
                .put(set("3", 6, 82.5, 120, "normal")),
            )
          )
          .put(
            exercise(
              "preview-ex-2",
              "Incline Dumbbell Shoulder Press",
              JSONArray()
                .put(set("4", 12, 22.5, 60, "normal"))
                .put(set("5", 12, 22.5, 60, "normal")),
            )
          )
          .put(
            exercise(
              "preview-ex-3",
              "Press-ups",
              JSONArray().put(set("6", 15, null, 45, "normal")),
            )
          ),
      )
  }
}
