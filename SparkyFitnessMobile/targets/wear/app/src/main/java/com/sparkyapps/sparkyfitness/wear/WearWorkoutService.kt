package com.sparkyapps.sparkyfitness.wear

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject
import java.nio.charset.StandardCharsets

/** The phone's workout messages. The screen reads [WorkoutHolder]. */
class WearWorkoutService : WearableListenerService() {
  override fun onMessageReceived(event: MessageEvent) {
    val json = try {
      JSONObject(String(event.data, StandardCharsets.UTF_8))
    } catch (_: Exception) {
      return
    }
    when (event.path) {
      WearPaths.WORKOUT_START -> WorkoutHolder.applyStart(json)
      WearPaths.WORKOUT_STOP -> WorkoutHolder.applyStop(json.optString("sessionId"))
      WearPaths.SET_TARGETS -> WorkoutHolder.applyTargets(json)
    }
  }
}
