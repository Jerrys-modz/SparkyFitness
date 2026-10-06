package expo.modules.watchconnectivity

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * Check-ins, water, rest, stops and set completions from the watch.
 * Kept until JavaScript acks them, and only replayed for the server
 * config that was active when they arrived.
 */
internal object EventInbox {
  private const val DIR = "wear-events"
  private const val PREFS = "wear_heart_rate"
  private const val OWNER = "owner"
  private val lock = Any()
  private val handed = HashSet<String>()

  data class Item(val event: String, val payload: Map<String, Any?>)

  enum class Stored { SAVED, DUPLICATE, WAITING }

  fun owner(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(OWNER, "") ?: ""

  /** False when no account is active yet, so the DataItem should stay. */
  fun store(context: Context, event: String, payload: Map<String, Any?>): Stored {
    synchronized(lock) {
      val owner = owner(context)
      val clientId = payload["clientId"] as? String
      if (owner.isEmpty() || clientId.isNullOrEmpty()) return Stored.WAITING
      val dir = directory(context) ?: return Stored.WAITING
      val file = File(dir, "$clientId.json")
      if (file.exists()) return Stored.DUPLICATE
      val ready = WearLink.jsonReady(payload) as? JSONObject ?: return Stored.WAITING
      ready.put("_event", event)
      ready.put("_owner", owner)
      file.writeText(ready.toString())
      return Stored.SAVED
    }
  }

  fun noteHanded(clientId: String) {
    synchronized(lock) { handed.add(clientId) }
  }

  /** Events not yet handed to JavaScript in this process, for this account. */
  fun replay(context: Context, events: Set<String>): List<Item> {
    synchronized(lock) {
      val owner = owner(context)
      if (owner.isEmpty()) return emptyList()
      val dir = directory(context) ?: return emptyList()
      val files = dir.listFiles()?.filter { it.isFile }?.sortedBy { it.name } ?: emptyList()
      return files.mapNotNull { file ->
        val map = try {
          WearLink.payloadMap(file.readText())
        } catch (_: Exception) {
          null
        } ?: return@mapNotNull null
        val event = map["_event"] as? String ?: return@mapNotNull null
        if (event !in events) return@mapNotNull null
        if (map["_owner"] != owner) return@mapNotNull null
        val clientId = map["clientId"] as? String ?: return@mapNotNull null
        if (!handed.add(clientId)) return@mapNotNull null
        Item(event, map.filterKeys { it != "_event" && it != "_owner" })
      }
    }
  }

  fun ack(context: Context, clientId: String, ok: Boolean) {
    synchronized(lock) {
      if (!ok) {
        handed.remove(clientId)
        return
      }
      handed.add(clientId)
      val dir = directory(context) ?: return
      File(dir, "$clientId.json").delete()
    }
  }

  private fun directory(context: Context): File? {
    val dir = File(context.filesDir, DIR)
    return if (dir.isDirectory || dir.mkdirs()) dir else null
  }
}
