package expo.modules.watchconnectivity

import android.content.Context
import java.io.File
import java.util.UUID

/**
 * Check-ins, water, rest and workout-stop from the watch. Kept until the
 * phone has pushed a context, which only happens after JavaScript is
 * listening, then delivered again. The hooks dedupe by client id.
 */
internal object EventInbox {
  private const val DIR = "wear-events"
  private val lock = Any()

  data class Item(val event: String, val payload: Map<String, Any?>)

  fun add(context: Context, event: String, payload: Map<String, Any?>) {
    synchronized(lock) {
      val dir = directory(context) ?: return
      val ready = WearLink.jsonReady(payload) as? org.json.JSONObject ?: return
      ready.put("_event", event)
      File(dir, "${System.currentTimeMillis()}-${UUID.randomUUID()}.json")
        .writeText(ready.toString())
    }
  }

  fun drain(context: Context): List<Item> {
    synchronized(lock) {
      val dir = directory(context) ?: return emptyList()
      val files = dir.listFiles()?.filter { it.isFile }?.sortedBy { it.name } ?: emptyList()
      val items = files.mapNotNull { file ->
        val map = try {
          WearLink.payloadMap(file.readText())
        } catch (_: Exception) {
          null
        }
        file.delete()
        val event = map?.get("_event") as? String ?: return@mapNotNull null
        Item(event, map)
      }
      return items
    }
  }

  private fun directory(context: Context): File? {
    val dir = File(context.filesDir, DIR)
    return if (dir.isDirectory || dir.mkdirs()) dir else null
  }
}

