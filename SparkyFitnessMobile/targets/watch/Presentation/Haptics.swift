import WatchKit

/// Tap feedback for the watch's buttons. On the wrist a press is easy to miss
/// — a sweaty finger, a glance away mid-set — so every button confirms it
/// registered, and all of them feel the same because they go through here.
///
/// Presses that already play something stay as they are: a container square
/// clicks on its own, and a check-in save plays `.success` once it is sent.
enum Haptics {
    /// An ordinary button press.
    static func tap() {
        WKInterfaceDevice.current().play(.click)
    }

    /// Logging a set, the one press that records something, so it reads
    /// differently from moving around.
    static func setLogged() {
        WKInterfaceDevice.current().play(.success)
    }

    /// `action`, preceded by a tap, for buttons built as `Button(action:)`.
    static func tapping(_ action: @escaping () -> Void) -> () -> Void {
        {
            tap()
            action()
        }
    }
}
