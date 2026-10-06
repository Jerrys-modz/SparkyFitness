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
      instance = this
      val ctx = appContext.reactContext
      if (ctx != null && playServices()) {
        WearLink.readCompletions(ctx) { payload, uri ->
          emitCompletion(payload, uri)
        }
        WearLink.readHeartRates(ctx) { payload, uri ->
          emitHeartRate(payload, uri)
        }
        WearLink.readPrefixed(ctx, WearLink.CHECK_IN) { payload, uri -> emitCheckIn(payload, uri) }
        WearLink.readPrefixed(ctx, WearLink.WATER_DELETE) { payload, uri -> emitWaterDelete(payload, uri) }
        WearLink.readPrefixed(ctx, WearLink.WATER) { payload, uri -> emitWater(payload, uri) }
        WearLink.readPrefixed(ctx, WearLink.REST) { payload, uri -> emitRest(payload, uri) }
        WearLink.readPrefixed(ctx, WearLink.WORKOUT_STOPPED) { payload, uri -> emitWorkoutStop(payload, uri) }
        WearLink.readPrefixed(ctx, WearLink.REQUEST_CONTEXT) { _, uri -> emitContextRequest(uri) }
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
      EventInbox.drain(ctx).forEach { item ->
        deliver(item.event, item.payload, null)
      }
      WearLink.put(ctx, WearLink.CONTEXT, context)
    }
    AsyncFunction("sendAck") { clientId: String, ok: Boolean ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      WearLink.put(ctx, "${WearLink.ACK}/$clientId", mapOf("clientId" to clientId, "ok" to ok))
    }
    AsyncFunction("updateIntervalTiming") { _: Map<String, Any?> -> }
    AsyncFunction("setTelemetryOwner") { ownerId: String ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      HeartRateQueue.setOwner(ctx, ownerId)
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

  private val seenCompletions = HashSet<String>()

  fun emitCompletion(payload: Map<String, Any?>, uri: android.net.Uri?) {
    val clientId = payload["clientId"] as? String ?: return
    synchronized(seenCompletions) {
      if (!seenCompletions.add(clientId)) return
    }
    sendEvent("onSetCompleted", payload)
    val ctx = appContext.reactContext ?: return
    if (uri != null) WearLink.delete(ctx, uri)
  }

  fun emitHeartRate(payload: Map<String, Any?>, uri: android.net.Uri?) {
    val ctx = appContext.reactContext ?: return
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

  private fun deliver(event: String, payload: Map<String, Any?>, uri: android.net.Uri?) {
    val ctx = appContext.reactContext ?: return
    val body = payload.filterKeys { it != "_event" }
    if (uri != null) EventInbox.add(ctx, event, body)
    sendEvent(event, body)
    if (uri != null) WearLink.delete(ctx, uri)
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
