import ExpoModulesCore
import WatchConnectivity

/// `WCSessionDelegate` extends `NSObjectProtocol`, which Swift only allows an
/// actual `NSObject` subclass to conform to — Expo's `Module` base class does
/// not qualify. So the delegate lives here and forwards to the module through
/// closures.
private class WatchSessionDelegateHandler: NSObject, WCSessionDelegate {
    var onReachabilityChange: ((Bool) -> Void)?
    /// A check-in captured on the watch, awaiting a server write.
    var onCheckIn: (([String: Any]) -> Void)?
    /// The watch asking for fresh seed values + history.
    var onContextRequest: (() -> Void)?
    /// A water container tap captured on the watch, awaiting a server write.
    var onWaterIntake: (([String: Any]) -> Void)?
    /// A request from the watch to delete one logged drink.
    var onWaterDelete: (([String: Any]) -> Void)?
    /// One set logged during an active workout on the watch.
    var onSetCompleted: (([String: Any]) -> Void)?
    /// A batch of heart-rate samples for one exercise, captured on the watch.
    var onHeartRateBatch: (([String: Any]) -> Void)?
    /// The wearer ended the workout on the watch.
    var onWorkoutStop: (([String: Any]) -> Void)?

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    private func route(_ payload: [String: Any]) {
        switch payload["type"] as? String {
        case "checkIn":
            onCheckIn?(payload)
        case "requestContext":
            onContextRequest?()
        case "waterIntake":
            onWaterIntake?(payload)
        case "waterDelete":
            onWaterDelete?(payload)
        case "setCompleted":
            onSetCompleted?(payload)
        case "heartRateBatch":
            onHeartRateBatch?(payload)
        case "workoutStop":
            onWorkoutStop?(payload)
        default:
            break
        }
    }

    // MARK: - WCSessionDelegate

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        onReachabilityChange?(session.isReachable)
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Re-activate so switching between paired Watches keeps working.
        session.activate()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        onReachabilityChange?(session.isReachable)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        route(message)
    }

    func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        route(message)
        replyHandler([:])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        route(userInfo)
    }
}

/// Phone-side bridge exposed to JS as `WatchConnectivity`.
///
/// The watch cannot reach the SparkyFitness server itself — authentication lives
/// here — so this module is the transport: it surfaces check-ins captured on the
/// watch to JS, which writes them via the normal measurements API, then relays
/// acknowledgements and fresh seed data back.
public class WatchConnectivityModule: Module {
    private let delegateHandler = WatchSessionDelegateHandler()

    public func definition() -> ModuleDefinition {
        Name("WatchConnectivity")

        Events(
            "onReachabilityChange",
            "onCheckIn",
            "onContextRequest",
            "onWaterIntake",
            "onWaterDelete",
            "onSetCompleted",
            "onHeartRateBatch",
            "onWorkoutStop"
        )

        OnCreate {
            self.delegateHandler.onReachabilityChange = { [weak self] isReachable in
                self?.sendEvent("onReachabilityChange", ["isReachable": isReachable])
            }
            self.delegateHandler.onCheckIn = { [weak self] payload in
                self?.sendEvent("onCheckIn", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "entryDate": payload["entryDate"] as? String ?? "",
                    "weightKg": payload["weightKg"] as? Double ?? 0,
                    // Absent (rather than null) when the wearer skipped body fat,
                    // so the JS side can omit it from the upsert instead of
                    // erasing an existing value.
                    "bodyFatPercentage": payload["bodyFatPercentage"] as? Double,
                ])
            }
            self.delegateHandler.onContextRequest = { [weak self] in
                self?.sendEvent("onContextRequest", [:])
            }
            self.delegateHandler.onWaterIntake = { [weak self] payload in
                self?.sendEvent("onWaterIntake", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "entryDate": payload["entryDate"] as? String ?? "",
                    "containerId": payload["containerId"] as? Int ?? 0,
                ])
            }
            self.delegateHandler.onWaterDelete = { [weak self] payload in
                self?.sendEvent("onWaterDelete", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "entryId": payload["entryId"] as? String ?? "",
                ])
            }
            self.delegateHandler.onSetCompleted = { [weak self] payload in
                self?.sendEvent("onSetCompleted", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "setId": payload["setId"] as? String ?? "",
                    // Absent (rather than null) when the watch had no value,
                    // so JS can omit the field from the set patch instead of
                    // clearing a planned one — same rule as body fat above.
                    "weightKg": payload["weightKg"] as? Double,
                    "reps": payload["reps"] as? Double,
                ])
            }
            self.delegateHandler.onHeartRateBatch = { [weak self] payload in
                self?.sendEvent("onHeartRateBatch", [
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "exerciseEntryId": payload["exerciseEntryId"] as? String ?? "",
                    // WatchConnectivity delivers nested dictionaries as NSArray
                    // of NSDictionary. `as? [[String: Any]]` often fails on that
                    // and would silently drop every sample (JS then posts
                    // calories-only). Walk `[Any]` instead.
                    "samples": dictionaryArray(payload["samples"]),
                    // Absent (rather than null) when the batch measured no
                    // energy, so JS can tell "nothing to add" from a zero —
                    // same rule body fat and the set values above follow.
                    // Forgetting this key is invisible in tests that fire the
                    // JS event directly: the watch keeps sending energy, the
                    // phone keeps buffering none, and calories silently stay
                    // derived-from-duration forever.
                    "activeEnergyKcal": payload["activeEnergyKcal"] as? Double,
                ])
            }
            self.delegateHandler.onWorkoutStop = { [weak self] payload in
                self?.sendEvent("onWorkoutStop", [
                    "sessionId": payload["sessionId"] as? String ?? "",
                ])
            }
            self.delegateHandler.activate()
        }

        Function("isSupported") { () -> Bool in
            WCSession.isSupported()
        }

        Function("isReachable") { () -> Bool in
            guard WCSession.isSupported() else { return false }
            return WCSession.default.isReachable
        }

        Function("isPaired") { () -> Bool in
            guard WCSession.isSupported() else { return false }
            return WCSession.default.isPaired
        }

        /// Pushes seed values, recent history and acknowledged client ids to the
        /// watch. Application context is latest-value-only and survives the watch
        /// app being asleep, which is exactly the semantics wanted here — a
        /// missed update is simply superseded by the next one.
        AsyncFunction("updateContext") { (context: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = context.compactMapValues(withoutNulls)
            payload["type"] = "context"
            try WCSession.default.updateApplicationContext(payload)
        }

        /// Immediate per-check-in acknowledgement for when the watch app is in
        /// the foreground. The authoritative ack still rides in the context, so
        /// this failing is harmless.
        AsyncFunction("sendAck") { (clientId: String, ok: Bool) -> Void in
            guard WCSession.isSupported(), WCSession.default.isReachable else { return }
            WCSession.default.sendMessage(
                ["type": "ack", "clientId": clientId, "ok": ok],
                replyHandler: nil,
                errorHandler: nil
            )
        }

        /// Arms the watch with the workout plan a live session was just
        /// started from. Deliberately NOT sent via `updateContext` above:
        /// application context is a single latest-value slot shared by the
        /// whole app, so a workout push would either be clobbered by the next
        /// nutrition/water context push or clobber it right back. This uses
        /// the same queued-message channel `sendAck` and the watch's own
        /// check-ins use instead — `sendMessage` when reachable, falling back
        /// to `transferUserInfo` (queued, delivered once the watch is back)
        /// so a workout started with the watch out of range still arrives.
        AsyncFunction("startWorkout") { (plan: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = plan.compactMapValues(withoutNulls)
            payload["type"] = "workoutStart"
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil) { _ in
                    WCSession.default.transferUserInfo(payload)
                }
            } else {
                WCSession.default.transferUserInfo(payload)
            }
        }

        /// Tells the watch the workout it was armed with is over, because it
        /// was finished (or discarded) on the phone. Without this the watch
        /// keeps an `HKWorkoutSession` running against a session the phone
        /// has already closed — a dead workout on screen and the sensor
        /// still sampling. Queued like `startWorkout` for the same reason: a
        /// watch out of range must still hear it eventually.
        AsyncFunction("stopWorkout") { (sessionId: String) -> Void in
            guard WCSession.isSupported() else { return }
            let payload: [String: Any] = ["type": "workoutStop", "sessionId": sessionId]
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil) { _ in
                    WCSession.default.transferUserInfo(payload)
                }
            } else {
                WCSession.default.transferUserInfo(payload)
            }
        }
    }
}

/// Strips JS `null`s out of a payload bound for `updateApplicationContext`.
///
/// That API accepts property-list types only — data, string, number, date,
/// array, dictionary — and a single `NSNull` anywhere in the tree makes it
/// throw `WCErrorCodeInvalidParameter`. It fails the WHOLE push, not the
/// offending field, so one absent body-fat reading silently costs the watch
/// every other value in the same dictionary.
///
/// Nulls are load-bearing in this payload rather than accidental: the bridge
/// sends `null` for a figure it cannot vouch for, and `history[]` entries
/// carry `bodyFatPercentage: null` whenever a day has a weight but no body
/// fat. Dropping the key is lossless, because the watch reads every optional
/// field as `payload["key"] as? Double`, which cannot tell an absent key from
/// a null one. The carry-forward paths in `ContextPayloadMapper` rely on the
/// same equivalence.
private func withoutNulls(_ value: Any) -> Any? {
    if value is NSNull { return nil }
    if let dictionary = value as? [String: Any] {
        return dictionary.compactMapValues(withoutNulls)
    }
    if let array = value as? [Any] {
        return array.compactMap(withoutNulls)
    }
    return value
}

/// WatchConnectivity nested arrays arrive as `NSArray` of `NSDictionary`.
/// A direct `as? [[String: Any]]` frequently returns nil for that, which
/// would drop heart-rate samples while still forwarding energy.
private func dictionaryArray(_ value: Any?) -> [[String: Any]] {
    if let typed = value as? [[String: Any]] { return typed }
    guard let any = value as? [Any] else { return [] }
    return any.compactMap { $0 as? [String: Any] }
}
