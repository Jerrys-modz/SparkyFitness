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
  }
}
