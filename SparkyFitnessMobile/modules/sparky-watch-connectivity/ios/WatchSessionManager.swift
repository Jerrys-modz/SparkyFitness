import Foundation
import WatchConnectivity

/// Phone-side `WCSession` owner. A singleton (mirroring the "one delegate per
/// process" WatchConnectivity requirement) so it can be activated once at
/// module `OnCreate` and outlive any single `SparkyWatchConnectivityModule`
/// instance recreated across JS reloads.
///
/// `updateApplicationContext` replaces the *entire* dictionary on every call —
/// there's no merge on the OS side — so callers must always send the full
/// mirrored state. `services/watchContext.ts` on the JS side is the one place
/// that assembles that full state; this class does no merging of its own.
final class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    /// Fired with the raw JSON string of a command sent watch → phone (see
    /// `WatchCommand` in `types/watchBridge.ts`).
    var onCommand: ((String) -> Void)?
    var onReachabilityChange: ((Bool, Bool, Bool) -> Void)?

    private override init() {
        super.init()
    }

    var isSupported: Bool {
        WCSession.isSupported()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    /// Replace the watch's mirrored application context. Throws if `json`
    /// isn't a valid JSON object or the OS call fails (e.g. session not
    /// activated, no paired watch).
    func updateContext(json: String) throws {
        guard WCSession.isSupported() else { return }
        guard let data = json.data(using: .utf8) else {
            throw NSError(domain: "SparkyWatchConnectivity", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "updateContext payload was not valid UTF-8",
            ])
        }
        let parsed = try JSONSerialization.jsonObject(with: data, options: [])
        guard let dict = parsed as? [String: Any] else {
            throw NSError(domain: "SparkyWatchConnectivity", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "updateContext payload must be a JSON object",
            ])
        }
        try WCSession.default.updateApplicationContext(dict)
    }

    func reachabilityInfo() -> [String: Bool] {
        guard WCSession.isSupported() else {
            return ["reachable": false, "paired": false, "watchAppInstalled": false]
        }
        let session = WCSession.default
        return [
            "reachable": session.isReachable,
            "paired": session.isPaired,
            "watchAppInstalled": session.isWatchAppInstalled,
        ]
    }

    private func emitCommand(_ payload: [String: Any]) {
        guard
            let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
            let json = String(data: data, encoding: .utf8)
        else { return }
        DispatchQueue.main.async { [weak self] in
            self?.onCommand?(json)
        }
    }

    private func emitReachabilityChange() {
        let info = reachabilityInfo()
        DispatchQueue.main.async { [weak self] in
            self?.onReachabilityChange?(
                info["reachable"] ?? false,
                info["paired"] ?? false,
                info["watchAppInstalled"] ?? false
            )
        }
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        emitReachabilityChange()
    }

    func sessionDidBecomeInactive(_ session: WCSession) {
        // No-op: the session remains valid until deactivate; nothing to tear down.
    }

    func sessionDidDeactivate(_ session: WCSession) {
        // Required when supporting multiple paired watches: reactivate for
        // the newly selected watch.
        session.activate()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        emitReachabilityChange()
    }

    func sessionWatchStateDidChange(_ session: WCSession) {
        emitReachabilityChange()
    }

    /// Messages sent from the watch via `sendMessage` (delivered immediately,
    /// requires `isReachable`).
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        emitCommand(message)
    }

    /// Commands sent from the watch via `transferUserInfo` (queued for
    /// guaranteed delivery even when the phone app isn't reachable yet).
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        emitCommand(userInfo)
    }
}
