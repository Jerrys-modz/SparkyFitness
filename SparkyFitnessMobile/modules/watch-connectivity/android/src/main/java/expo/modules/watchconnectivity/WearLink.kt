package expo.modules.watchconnectivity

import android.content.Context
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets

/**
 * Phone side of the Wear OS link. The watch app advertises
 * [CAPABILITY] and listens on [PREFIX]. Message paths here and in
 * `targets/wear` are the same strings on purpose.
 */
internal object WearLink {
  const val CAPABILITY = "sparky_fitness_wear"
  const val PREFIX = "/sparky"
  const val WORKOUT_START = "$PREFIX/workout/start"
  const val WORKOUT_STOP = "$PREFIX/workout/stop"
  const val SET_TARGETS = "$PREFIX/set/targets"
  const val SET_COMPLETED = "$PREFIX/set/completed"

  private val lock = Any()
  private val pending = ArrayDeque<Map<String, Any?>>()
  var onMessage: ((Map<String, Any?>) -> Unit)? = null

  fun offer(payload: Map<String, Any?>) {
    val listener = synchronized(lock) { onMessage }
    if (listener != null) {
      listener(payload)
    } else {
      synchronized(lock) { pending.addLast(payload) }
    }
  }

  fun attach(listener: (Map<String, Any?>) -> Unit) {
    val queued = synchronized(lock) {
      onMessage = listener
      val copy = pending.toList()
      pending.clear()
      copy
    }
    queued.forEach(listener)
  }

  fun detach() {
    synchronized(lock) { onMessage = null }
  }

  fun send(context: Context, path: String, payload: Map<String, Any?>) {
    val ready = jsonReady(payload) as? JSONObject ?: return
    sendRaw(context, path, ready.toString().toByteArray(StandardCharsets.UTF_8))
  }

  fun sendRaw(context: Context, path: String, bytes: ByteArray) {
    Wearable.getCapabilityClient(context)
      .getCapability(CAPABILITY, CapabilityClient.FILTER_REACHABLE)
      .addOnSuccessListener { info ->
        val client = Wearable.getMessageClient(context)
        info.nodes.forEach { node ->
          client.sendMessage(node.id, path, bytes)
        }
      }
  }

  /** Drops nulls. Nested maps and lists become JSON objects and arrays. */
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

  fun payloadMap(bytes: ByteArray): Map<String, Any?> {
    val obj = JSONObject(String(bytes, StandardCharsets.UTF_8))
    return jsonToMap(obj)
  }

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
