import HealthKit
import UserNotifications
import WatchKit

/// Rest-end cues on the wrist.
///
/// The workout's `HKWorkoutSession` keeps this app running with the wrist
/// down, so the watch's own rest countdown reaches zero on time and can buzz
/// without the phone. The phone still schedules its "Rest complete"
/// notification for the same moment; while a workout is running here that
/// banner would be a second buzz for the same event, so it is hidden.
final class WatchAppDelegate: NSObject, WKApplicationDelegate, UNUserNotificationCenterDelegate {
    /// Must match `REST_COMPLETE_CATEGORY` in the phone's notifications service.
    static let restCompleteCategory = "rest-complete"

    func applicationDidFinishLaunching() {
        UNUserNotificationCenter.current().delegate = self
        Task { @MainActor in
            WorkoutSessionStore.shared.onRestFinished = {
                WKInterfaceDevice.current().play(.notification)
            }
        }
    }

    /// The phone started a workout and asked watchOS to open this app (see
    /// `launchWatchApp` in the phone's WatchConnectivity module). The plan
    /// itself comes over WatchConnectivity, queued behind this launch, and
    /// `WatchSessionManager` starts the HealthKit session when it lands, so
    /// all this has to do is make sure the session is up to receive it.
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in
            _ = WatchSessionManager.shared
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        let showNormally: UNNotificationPresentationOptions = [.banner, .list, .sound]
        guard notification.request.content.categoryIdentifier == Self.restCompleteCategory else {
            return showNormally
        }
        let watchOwnsRest = await MainActor.run { WorkoutSessionStore.shared.isActive }
        return watchOwnsRest ? [] : showNormally
    }
}
