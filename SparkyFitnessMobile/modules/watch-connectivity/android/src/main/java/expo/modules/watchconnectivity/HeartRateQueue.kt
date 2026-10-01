package expo.modules.watchconnectivity

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * Heart-rate batches the watch already sent. Stamped with the server
 * config that was active on arrival and kept until JS acks them, matching
 * the iOS queue. A batch with no active config is counted and dropped.
 */
internal object HeartRateQueue {
  private const val PREFS = "wear_heart_rate"
  private const val OWNER = "owner"
  private const val DROPPED = "dropped"
  private const val DIR = "wear-heart-rate"
  private const val LIMIT = 200
  private val lock = Any()

  @Volatile private var ownerLoaded = false
  @Volatile private var ownerId = ""

  fun setOwner(context: Context, id: String) {
    synchronized(lock) {
      ownerId = id
      ownerLoaded = true
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(OWNER, id)
        .commit()
    }
  }

  /** Null when the batch was dropped or already stored. */
  fun accept(context: Context, payload: Map<String, Any?>): Map<String, Any?>? {
    synchronized(lock) {
      val owner = owner(context)
      if (owner.isEmpty()) {
        bumpDropped(context)
        return null
      }
      val event = LinkedHashMap<String, Any?>()
      event["clientId"] = payload["clientId"] as? String ?: ""
      event["sessionId"] = payload["sessionId"] as? String ?: ""
      event["exerciseEntryId"] = payload["exerciseEntryId"] as? String ?: ""
      event["samples"] = payload["samples"] ?: emptyList<Any>()
      (payload["activeEnergyKcal"] as? Number)?.let { event["activeEnergyKcal"] = it.toDouble() }
      (payload["durationMinutes"] as? Number)?.let { event["durationMinutes"] = it.toDouble() }
      event["ownerId"] = owner
      val clientId = event["clientId"] as String
      if (clientId.isEmpty()) event["queueId"] = UUID.randomUUID().toString()
      val dir = directory(context) ?: run {
        bumpDropped(context)
        return null
      }
      val existing = dir.listFiles()?.map { it.name }?.toSet().orEmpty()
      if (clientId.isNotEmpty() && batchFiles(dir).any { storedId(it) == clientId }) {
        return null
      }
      val file = File(dir, "${System.currentTimeMillis()}-${UUID.randomUUID()}.json")
      val ready = WearLink.jsonReady(event) as? JSONObject ?: run {
        bumpDropped(context)
        return null
      }
      file.writeText(ready.toString())
      trim(context, dir)
      if (file.name !in existing && file.exists()) return event
      return event
    }
  }

  fun pending(context: Context): List<Map<String, Any?>> {
    synchronized(lock) {
      val dir = directory(context) ?: return emptyList()
      return batchFiles(dir).mapNotNull { file ->
        try {
          WearLink.payloadMap(file.readText())
        } catch (_: Exception) {
          null
        }
      }
    }
  }

  fun ack(context: Context, ids: List<String>) {
    val wanted = ids.toSet()
    synchronized(lock) {
      val dir = directory(context) ?: return
      batchFiles(dir).forEach { file ->
        val event = try {
          WearLink.payloadMap(file.readText())
        } catch (_: Exception) {
          return@forEach
        }
        val clientId = event["clientId"] as? String ?: ""
        val queueId = event["queueId"] as? String ?: ""
        if ((clientId.isNotEmpty() && clientId in wanted) || queueId in wanted) {
          file.delete()
        }
      }
    }
  }

  fun takeDropped(context: Context): Int {
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val dropped = prefs.getInt(DROPPED, 0)
      prefs.edit().putInt(DROPPED, 0).commit()
      return dropped
    }
  }

  private fun owner(context: Context): String {
    if (!ownerLoaded) {
      ownerId = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(OWNER, "") ?: ""
      ownerLoaded = true
    }
    return ownerId
  }

  private fun bumpDropped(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit().putInt(DROPPED, prefs.getInt(DROPPED, 0) + 1).commit()
  }

  private fun directory(context: Context): File? {
    val dir = File(context.filesDir, DIR)
    return if (dir.isDirectory || dir.mkdirs()) dir else null
  }

  private fun batchFiles(dir: File): List<File> =
    dir.listFiles()?.filter { it.isFile && it.name.endsWith(".json") }?.sortedBy { it.name }
      ?: emptyList()

  private fun storedId(file: File): String? =
    try {
      WearLink.payloadMap(file.readText())["clientId"] as? String
    } catch (_: Exception) {
      null
    }

  private fun trim(context: Context, dir: File) {
    val files = batchFiles(dir)
    val extra = files.size - LIMIT
    if (extra <= 0) return
    files.take(extra).forEach { it.delete() }
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit().putInt(DROPPED, prefs.getInt(DROPPED, 0) + extra).commit()
  }
}
