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
      WearLink.attach { payload ->
        sendEvent("onSetCompleted", payload)
      }
      if (playServices()) refreshNodes()
    }

    OnDestroy {
      WearLink.detach()
    }

    Function("isSupported") { playServices() }

    Function("isReachable") { reachable }
    Function("isPaired") { paired }

    AsyncFunction("updateContext") { _: Map<String, Any?> -> }
    AsyncFunction("sendAck") { _: String, _: Boolean -> }
    AsyncFunction("updateIntervalTiming") { _: Map<String, Any?> -> }
    AsyncFunction("setTelemetryOwner") { _: String -> }
    AsyncFunction("pendingHeartRateBatches") { emptyList<Map<String, Any?>>() }
    AsyncFunction("ackHeartRateBatches") { _: List<String> -> }
    AsyncFunction("takeDroppedHeartRateBatchCount") { 0 }

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
    WearLink.send(ctx, path, withType)
  }
}
