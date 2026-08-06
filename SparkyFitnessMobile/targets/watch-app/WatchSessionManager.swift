import Foundation
import WatchConnectivity

/// Watch-side `WCSession` owner: decodes the phone's mirrored `WatchAppContext`
/// and sends `WatchCommand`s back. A singleton `ObservableObject` so every
/// view can `@ObservedObject`/`@EnvironmentObject` the same live state instead
/// of each view managing its own session.
final class WatchSessionManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    @Published var context: WatchAppContext = .empty
    @Published var isReachable: Bool = false

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    /// Send a command to the phone. Prefers `sendMessage` (immediate, requires
    /// `isReachable`) and falls back to `transferUserInfo` (queued, delivered
    /// once the phone app is reachable again) both when unreachable and when
    /// an in-flight `sendMessage` fails, so a tap is never silently dropped.
    func send(_ command: WatchCommand) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.isReachable else {
            session.transferUserInfo(command.payload)
            return
        }
        session.sendMessage(command.payload, replyHandler: nil) { _ in
            session.transferUserInfo(command.payload)
        }
    }

    /// Ask the phone to resend the full context, e.g. when the watch app
    /// launches after the OS discarded its process.
    func requestSync() {
        send(.requestSync)
    }

    private func applyContext(_ raw: [String: Any]) {
        guard
            let data = try? JSONSerialization.data(withJSONObject: raw, options: []),
            let decoded = try? JSONDecoder().decode(WatchAppContext.self, from: data)
        else { return }
        DispatchQueue.main.async { [weak self] in
            self?.context = decoded
        }
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // The phone may have pushed a context before this activation
        // completed; catch up on it immediately instead of waiting for the
        // next push.
        if !session.receivedApplicationContext.isEmpty {
            applyContext(session.receivedApplicationContext)
        }
        DispatchQueue.main.async { [weak self] in
            self?.isReachable = session.isReachable
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        applyContext(applicationContext)
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { [weak self] in
            self?.isReachable = session.isReachable
        }
    }
}
