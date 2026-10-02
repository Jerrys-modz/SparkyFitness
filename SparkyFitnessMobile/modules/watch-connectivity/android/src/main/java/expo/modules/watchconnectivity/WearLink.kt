package expo.modules.watchconnectivity

import android.content.Context
import android.net.Uri
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject

/**
 * Phone side of the Wear OS link. Payloads are DataItems, not one-shot
 * messages: a watch that is out of range when the phone sends still gets
 * the item when it reconnects. Completions use a path per clientId so one
 * does not overwrite another.
 */
internal object WearLink {
  const val CAPABILITY = "sparky_fitness_wear"
  const val PREFIX = "/sparky"
  const val WORKOUT_START = "$PREFIX/workout/start"
  const val WORKOUT_STOP = "$PREFIX/workout/stop"
  const val SET_TARGETS = "$PREFIX/set/targets"
  const val SET_COMPLETED = "$PREFIX/set/completed"
  const val HEART_RATE = "$PREFIX/heart-rate"
  const val CONTEXT = "$PREFIX/context"
  const val CHECK_IN = "$PREFIX/check-in"
  const val WATER = "$PREFIX/water"
  const val WATER_DELETE = "$PREFIX/water-delete"
  const val REST = "$PREFIX/rest"
  const val WORKOUT_STOPPED = "$PREFIX/workout/stopped"
  const val REQUEST_CONTEXT = "$PREFIX/request-context"
  const val ACK = "$PREFIX/ack"

  fun put(context: Context, path: String, payload: Map<String, Any?>) {
    val ready = jsonReady(payload) as? JSONObject ?: return
    val request = PutDataMapRequest.create(path)
    request.dataMap.putString("json", ready.toString())
    // A repeat of the same plan must still sync. DataItems are dropped
    // when the bytes do not change.
    request.dataMap.putLong("at", System.currentTimeMillis())
    Wearable.getDataClient(context).putDataItem(request.asPutDataRequest().setUrgent())
  }

  fun putCompletion(context: Context, clientId: String, payload: Map<String, Any?>) {
    put(context, "$SET_COMPLETED/$clientId", payload)
  }

  fun readCompletions(context: Context, onEach: (Map<String, Any?>, Uri) -> Unit) {
    readPrefixed(context, SET_COMPLETED, onEach)
  }

  fun readHeartRates(context: Context, onEach: (Map<String, Any?>, Uri) -> Unit) {
    readPrefixed(context, HEART_RATE, onEach)
  }

  internal fun readPrefixed(
    context: Context,
    path: String,
    onEach: (Map<String, Any?>, Uri) -> Unit,
    onDone: () -> Unit = {},
  ) {
    val uri = Uri.Builder().scheme("wear").path(path).build()
    val task = Wearable.getDataClient(context).getDataItems(uri, DataClient.FILTER_PREFIX)
    task.addOnSuccessListener { buffer ->
      try {
        for (i in 0 until buffer.count) {
          val item = buffer.get(i)
          val itemPath = item.uri.path ?: continue
          if (itemPath != path && !itemPath.startsWith("$path/")) continue
          val json = DataMapItem.fromDataItem(item).dataMap.getString("json") ?: continue
          val payload = try {
            payloadMap(json)
          } catch (_: Exception) {
            continue
          }
          onEach(payload, item.uri)
        }
      } finally {
        buffer.release()
        onDone()
      }
    }
    task.addOnFailureListener { onDone() }
  }

  fun delete(context: Context, uri: Uri) {
    Wearable.getDataClient(context).deleteDataItems(uri)
  }

  fun heartRatesFrom(events: DataEventBuffer): List<Pair<Map<String, Any?>, Uri>> =
    itemsFrom(events, HEART_RATE)

  fun completionsFrom(events: DataEventBuffer): List<Pair<Map<String, Any?>, Uri>> =
    itemsFrom(events, SET_COMPLETED)

  internal fun itemsFrom(events: DataEventBuffer, prefix: String): List<Pair<Map<String, Any?>, Uri>> {
    val out = mutableListOf<Pair<Map<String, Any?>, Uri>>()
    for (event in events) {
      if (event.type != DataEvent.TYPE_CHANGED) continue
      val path = event.dataItem.uri.path ?: continue
      if (path != prefix && !path.startsWith("$prefix/")) continue
      val json = DataMapItem.fromDataItem(event.dataItem).dataMap.getString("json") ?: continue
      val payload = try {
        payloadMap(json)
      } catch (_: Exception) {
        continue
      }
      out.add(payload to event.dataItem.uri)
    }
    return out
  }

  fun jsonReady(value: Any?): Any? {
    return when (value) {
      null -> null
      is Map<*, *> -> {
        val obj = JSONObject()
        value.forEach { (key, item) ->
          if (key is String) {
            val ready = jsonReady(item)
            if (ready != null) obj.put(key, ready)
          }
        }
        obj
      }
      is List<*> -> {
        val array = JSONArray()
        value.forEach { item ->
          val ready = jsonReady(item)
          if (ready != null) array.put(ready)
        }
        array
      }
      is JSONObject, is JSONArray, is String, is Boolean, is Number -> value
      else -> value.toString()
    }
  }

  fun payloadMap(json: String): Map<String, Any?> = jsonToMap(JSONObject(json))

  private fun jsonToMap(obj: JSONObject): Map<String, Any?> {
    val out = linkedMapOf<String, Any?>()
    val keys = obj.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      out[key] = jsonToAny(obj.get(key))
    }
    return out
  }

  private fun jsonToAny(value: Any?): Any? {
    return when (value) {
      null, JSONObject.NULL -> null
      is JSONObject -> jsonToMap(value)
      is JSONArray -> List(value.length()) { index -> jsonToAny(value.get(index)) }
      is Number -> value.toDouble()
      else -> value
    }
  }
}
