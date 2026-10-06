package expo.modules.watchconnectivity

import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android stand-in for the iOS WatchConnectivity bridge. The same JS hooks
 * arm the watch and take a logged set. Check-ins, water and heart rate are
 * accepted and ignored until the Wear app grows those screens.
 */
class WatchConnectivityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WatchConnectivity")

    Events(
      "onReachabilityChange",
      "onCheckIn",
      "onContextRequest",
      "onWaterIntake",
      "onWaterDelete",
      "onSetCompleted",
      "onRestChanged",
      "onHeartRateBatch",
      "onWorkoutStop"
    )

    OnCreate {
      instance = this@WatchConnectivityModule
      val ctx = appContext.reactContext
      if (ctx != null && playServices()) {
        WearLink.readCompletions(ctx) { payload, uri ->
          emitCompletion(payload, uri)
        }
        WearLink.readHeartRates(ctx) { payload, uri ->
          emitHeartRate(payload, uri)
        }
        WearLink.readPrefixed(ctx, WearLink.CHECK_IN, { payload, uri -> ingest("onCheckIn", payload, uri) })
        WearLink.readPrefixed(ctx, WearLink.WATER_DELETE, { payload, uri -> ingest("onWaterDelete", payload, uri) })
        WearLink.readPrefixed(ctx, WearLink.WATER, { payload, uri -> ingest("onWaterIntake", payload, uri) })
        WearLink.readPrefixed(ctx, WearLink.REST, { payload, uri -> ingest("onRestChanged", payload, uri) })
        WearLink.readPrefixed(ctx, WearLink.WORKOUT_STOPPED, { payload, uri -> ingest("onWorkoutStop", payload, uri) })
        WearLink.readPrefixed(ctx, WearLink.SET_COMPLETED, { payload, uri -> ingest("onSetCompleted", payload, uri) })
        WearLink.readPrefixed(ctx, WearLink.REQUEST_CONTEXT, { _, uri -> emitContextRequest(uri) })
        refreshNodes()
      }
    }

    OnDestroy {
      instance = null
    }

    Function("isSupported") { playServices() }

    Function("isReachable") { reachable }
    Function("isPaired") { paired }

    AsyncFunction("updateContext") { context: Map<String, Any?> ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      EventInbox.replay(ctx, setOf("onCheckIn", "onWaterIntake", "onWaterDelete")).forEach { item ->
        sendEvent(item.event, item.payload)
      }
      WearLink.put(ctx, WearLink.CONTEXT, context)
    }
    AsyncFunction("sendAck") { clientId: String, ok: Boolean ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      EventInbox.ack(ctx, clientId, ok)
      if (ok) {
        WearLink.put(ctx, "${WearLink.ACK}/$clientId", mapOf("clientId" to clientId, "ok" to ok))
      }
    }
    AsyncFunction("pendingWorkoutEvents") {
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      EventInbox.replay(ctx, setOf("onSetCompleted", "onRestChanged", "onWorkoutStop")).map { item ->
        val body = LinkedHashMap(item.payload)
        body["event"] = item.event
        body
      }
    }
    AsyncFunction("updateIntervalTiming") { _: Map<String, Any?> -> }
    AsyncFunction("setTelemetryOwner") { ownerId: String ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      HeartRateQueue.setOwner(ctx, ownerId)
      if (ownerId.isEmpty()) return@AsyncFunction
      WearLink.readHeartRates(ctx) { payload, uri -> emitHeartRate(payload, uri) }
      rescan(ctx) {
        EventInbox.replay(
          ctx,
          setOf(
            "onCheckIn",
            "onWaterIntake",
            "onWaterDelete",
            "onSetCompleted",
            "onRestChanged",
            "onWorkoutStop",
          )
        ).forEach { item -> sendEvent(item.event, item.payload) }
      }
    }
    AsyncFunction("pendingHeartRateBatches") {
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      HeartRateQueue.pending(ctx)
    }
    AsyncFunction("ackHeartRateBatches") { clientIds: List<String> ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      HeartRateQueue.ack(ctx, clientIds)
    }
    AsyncFunction("takeDroppedHeartRateBatchCount") {
      val ctx = appContext.reactContext ?: return@AsyncFunction 0
      HeartRateQueue.takeDropped(ctx)
    }

    AsyncFunction("startWorkout") { plan: Map<String, Any?> ->
      send(WearLink.WORKOUT_START, plan, "workoutStart")
    }

    AsyncFunction("stopWorkout") { sessionId: String, stoppedAt: String ->
      send(
        WearLink.WORKOUT_STOP,
        mapOf("sessionId" to sessionId, "stoppedAt" to stoppedAt),
        "workoutStop"
      )
    }

    AsyncFunction("updateSetTargets") { update: Map<String, Any?> ->
      send(WearLink.SET_TARGETS, update, "setTargets")
    }
  }

  @Volatile private var reachable = false
  @Volatile private var paired = false

  private fun rescan(ctx: android.content.Context, onDone: () -> Unit) {
    val left = java.util.concurrent.atomic.AtomicInteger(6)
    val step = {
      if (left.decrementAndGet() == 0) onDone()
    }
    fun read(path: String, event: String) {
      WearLink.readPrefixed(ctx, path, { payload, uri -> ingest(event, payload, uri) }, step)
    }
    read(WearLink.CHECK_IN, "onCheckIn")
    read(WearLink.WATER_DELETE, "onWaterDelete")
    read(WearLink.WATER, "onWaterIntake")
    read(WearLink.REST, "onRestChanged")
    read(WearLink.WORKOUT_STOPPED, "onWorkoutStop")
    read(WearLink.SET_COMPLETED, "onSetCompleted")
  }

  fun emitCompletion(payload: Map<String, Any?>, uri: android.net.Uri?) {
    deliver("onSetCompleted", payload, uri)
  }

  fun emitHeartRate(payload: Map<String, Any?>, uri: android.net.Uri?) {
    val ctx = appContext.reactContext ?: return
    if (HeartRateQueue.belongsElsewhere(ctx, payload)) return
    val event = HeartRateQueue.accept(ctx, payload)
    if (uri != null) WearLink.delete(ctx, uri)
    if (event != null) sendEvent("onHeartRateBatch", event)
  }

  fun emitCheckIn(payload: Map<String, Any?>, uri: android.net.Uri?) =
    deliver("onCheckIn", payload, uri)

  fun emitWater(payload: Map<String, Any?>, uri: android.net.Uri?) =
    deliver("onWaterIntake", payload, uri)

  fun emitWaterDelete(payload: Map<String, Any?>, uri: android.net.Uri?) =
    deliver("onWaterDelete", payload, uri)

  fun emitRest(payload: Map<String, Any?>, uri: android.net.Uri?) =
    deliver("onRestChanged", payload, uri)

  fun emitWorkoutStop(payload: Map<String, Any?>, uri: android.net.Uri?) =
    deliver("onWorkoutStop", payload, uri)

  fun emitContextRequest(uri: android.net.Uri?) {
    sendEvent("onContextRequest", emptyMap<String, Any>())
    val ctx = appContext.reactContext ?: return
    if (uri != null) WearLink.delete(ctx, uri)
  }

  private fun ingest(event: String, payload: Map<String, Any?>, uri: android.net.Uri?) {
    val ctx = appContext.reactContext ?: return
    if (EventInbox.store(ctx, event, payload) != EventInbox.Stored.WAITING && uri != null) {
      WearLink.delete(ctx, uri)
    }
  }

  private fun deliver(event: String, payload: Map<String, Any?>, uri: android.net.Uri?) {
    val ctx = appContext.reactContext ?: return
    val body = payload.filterKeys { it != "_event" && it != "_owner" }
    val clientId = body["clientId"] as? String
    if (clientId.isNullOrEmpty()) {
      sendEvent(event, body)
      if (uri != null) WearLink.delete(ctx, uri)
      return
    }
    val stored = EventInbox.store(ctx, event, body)
    if (stored == EventInbox.Stored.WAITING) return
    if (uri != null) WearLink.delete(ctx, uri)
    if (stored == EventInbox.Stored.DUPLICATE) return
    EventInbox.noteHanded(clientId)
    sendEvent(event, body)
  }

  companion object {
    @Volatile var instance: WatchConnectivityModule? = null
  }

  private fun playServices(): Boolean {
    val ctx = appContext.reactContext ?: return false
    return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(ctx) ==
      ConnectionResult.SUCCESS
  }

  private fun refreshNodes() {
    val ctx = appContext.reactContext ?: return
    val client = Wearable.getCapabilityClient(ctx)
    client.getCapability(WearLink.CAPABILITY, CapabilityClient.FILTER_ALL)
      .addOnSuccessListener { paired = it.nodes.isNotEmpty() }
    client.getCapability(WearLink.CAPABILITY, CapabilityClient.FILTER_REACHABLE)
      .addOnSuccessListener { reachable = it.nodes.isNotEmpty() }
  }

  private fun send(path: String, body: Map<String, Any?>, type: String) {
    val ctx = appContext.reactContext ?: return
    val withType = LinkedHashMap(body)
    withType["type"] = type
    WearLink.put(ctx, path, withType)
  }
}
