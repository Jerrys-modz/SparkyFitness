package expo.modules.watchconnectivity

import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.WearableListenerService

/** A set logged on the watch. The DataItem stays until the module applies it,
 * so a delivery that lands before JS is up is still there on the next read. */
class PhoneWearListener : WearableListenerService() {
  override fun onDataChanged(events: DataEventBuffer) {
    val module = WatchConnectivityModule.instance ?: return
    WearLink.completionsFrom(events).forEach { (payload, uri) ->
      module.emitCompletion(payload, uri)
    }
    WearLink.heartRatesFrom(events).forEach { (payload, uri) ->
      module.emitHeartRate(payload, uri)
    }
    WearLink.itemsFrom(events, WearLink.CHECK_IN).forEach { (payload, uri) ->
      module.emitCheckIn(payload, uri)
    }
    WearLink.itemsFrom(events, WearLink.WATER_DELETE).forEach { (payload, uri) ->
      module.emitWaterDelete(payload, uri)
    }
    WearLink.itemsFrom(events, WearLink.WATER).forEach { (payload, uri) ->
      module.emitWater(payload, uri)
    }
    WearLink.itemsFrom(events, WearLink.REST).forEach { (payload, uri) ->
      module.emitRest(payload, uri)
    }
    WearLink.itemsFrom(events, WearLink.WORKOUT_STOPPED).forEach { (payload, uri) ->
      module.emitWorkoutStop(payload, uri)
    }
    WearLink.itemsFrom(events, WearLink.REQUEST_CONTEXT).forEach { (_, uri) ->
      module.emitContextRequest(uri)
    }
  }
}
