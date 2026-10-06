package expo.modules.watchconnectivity

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/** A set logged on the watch. Held until the JS module is up, then emitted. */
class PhoneWearListener : WearableListenerService() {
  override fun onMessageReceived(event: MessageEvent) {
    if (event.path != WearLink.SET_COMPLETED) return
    try {
      WearLink.offer(WearLink.payloadMap(event.data))
    } catch (_: Exception) {
      // A message that is not the JSON we send is not a logged set.
    }
  }
}
