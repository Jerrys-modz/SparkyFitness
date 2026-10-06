package com.sparkyapps.sparkyfitness.wear

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

/** The phone's workout DataItems. A watch that was asleep still receives them. */
class WearWorkoutService : WearableListenerService() {
  override fun onDataChanged(events: DataEventBuffer) {
    val found = mutableListOf<Triple<String, String, Long>>()
    for (event in events) {
      if (event.type != DataEvent.TYPE_CHANGED) continue
      val path = event.dataItem.uri.path ?: continue
      if (path.startsWith(WearPaths.SET_COMPLETED)) continue
      val map = DataMapItem.fromDataItem(event.dataItem).dataMap
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
        WearPaths.WORKOUT_START -> WorkoutHolder.applyStart(body)
        WearPaths.WORKOUT_STOP -> WorkoutHolder.applyStop(body.optString("sessionId"))
        WearPaths.SET_TARGETS -> WorkoutHolder.applyTargets(body)
      }
    }
  }
}
