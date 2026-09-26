import ExpoModulesCore
import Security
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
    private let heartRateQueueKey = "sparky.pendingHeartRateBatches"
    /// One batch a minute. Six hours is longer than a workout this queue is
    /// meant to cover; the byte cap stops one huge payload from growing the
    /// keychain item without a bound.
    private let heartRateQueueBatchLimit = 360
    private let heartRateQueueByteLimit = 1_048_576
    private var heartRateQueue: [[String: Any]] = []
    private var heartRateQueueNeedsSave = false
    /// The watch callback and this module's queue both touch `heartRateQueue`.
    /// One serial queue so a drain and an ack can't interleave.
    private let heartRateAccess = DispatchQueue(label: "sparky.watch.heartRateQueue")

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
            self.heartRateAccess.sync {
                self.loadHeartRateQueue()
            }
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
                    "completedAt": payload["completedAt"] as? String,
                ])
            }
            self.delegateHandler.onHeartRateBatch = { [weak self] payload in
                guard let self else { return }
                let event = self.heartRateEvent(from: payload)
                self.heartRateAccess.sync {
                    self.rememberHeartRateBatch(event)
                }
                self.sendEvent("onHeartRateBatch", event)
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
        /// nutrition/water context push or clobber it right back.
        ///
        /// `workoutStart` is queued so it stays ahead of later `intervalTiming`
        /// transfers, and also sent immediately when the watch is reachable.
        /// The watch drops a start for a session it has already ended, so the
        /// queued copy cannot restart a workout a faster `workoutStop` finished.
        AsyncFunction("startWorkout") { (plan: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = plan.compactMapValues(withoutNulls)
            payload["type"] = "workoutStart"
            WCSession.default.transferUserInfo(payload)
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
            }
        }

        /// Tells the watch the workout it was armed with is over, because it
        /// was finished (or discarded) on the phone. Without this the watch
        /// keeps an `HKWorkoutSession` running against a session the phone
        /// has already closed — a dead workout on screen and the sensor
        /// still sampling. Queued like `startWorkout` for the same reason: a
        /// watch out of range must still hear it eventually.
        AsyncFunction("stopWorkout") { (sessionId: String, stoppedAt: String) -> Void in
            guard WCSession.isSupported() else { return }
            let payload: [String: Any] = [
                "type": "workoutStop",
                "sessionId": sessionId,
                "stoppedAt": stoppedAt,
            ]
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil) { _ in
                    WCSession.default.transferUserInfo(payload)
                }
            } else {
                WCSession.default.transferUserInfo(payload)
            }
        }

        /// Pause or resume the cap. Always queued, so a watch out of range
        /// still hears it, and sent immediately when reachable so the cap
        /// freezes without waiting for the queue. The watch keeps a snapshot
        /// that arrives before the plan and ignores an older revision.
        AsyncFunction("updateIntervalTiming") { (timing: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = timing
            payload["type"] = "intervalTiming"
            WCSession.default.transferUserInfo(payload)
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
            }
        }

        /// Batches that arrived before JavaScript was listening. JS drains
        /// these on startup and acks the ones it has stored. Async so the
        /// read is not on the JS thread; the queue lock is the actual guard.
        AsyncFunction("pendingHeartRateBatches") { () -> [[String: Any]] in
            self.heartRateAccess.sync {
                // Retry a keychain write that failed. A clean queue is not
                // rewritten on every read.
                if self.heartRateQueueNeedsSave {
                    _ = self.saveHeartRateQueue()
                }
                return self.heartRateQueue
            }
        }

        AsyncFunction("ackHeartRateBatches") { (clientIds: [String]) in
            let ids = Set(clientIds)
            self.heartRateAccess.sync {
                let previous = self.heartRateQueue
                self.heartRateQueue.removeAll { event in
                    if let clientId = event["clientId"] as? String,
                       !clientId.isEmpty,
                       ids.contains(clientId) {
                        return true
                    }
                    if let queueId = event["queueId"] as? String, ids.contains(queueId) {
                        return true
                    }
                    return false
                }
                // Leave the batch queued when the keychain write fails.
                // JS will ack again after the next successful save.
                if !self.saveHeartRateQueue() {
                    self.heartRateQueue = previous
                }
            }
        }
    }

    /// Caller holds `heartRateAccess`. Reads the keychain copy. A leftover
    /// UserDefaults value is from before the queue was encrypted; it is moved
    /// once and then deleted so backups stop carrying the samples.
    private func loadHeartRateQueue() {
        if let data = heartRateQueueDataFromKeychain(),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            heartRateQueue = parsed.map { self.withQueueId($0) }
            if !saveHeartRateQueue() {
                heartRateQueueNeedsSave = true
            }
            return
        }
        guard
            let text = UserDefaults.standard.string(forKey: heartRateQueueKey),
            let data = text.data(using: .utf8),
            let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return }
        heartRateQueue = parsed.map { self.withQueueId($0) }
        if !saveHeartRateQueue() {
            heartRateQueueNeedsSave = true
        }
    }

    /// Caller holds `heartRateAccess`. The item is ThisDeviceOnly, so it is
    /// encrypted by the keychain and left out of backups. False means the
    /// in-memory queue is still the only copy.
    @discardableResult
    private func saveHeartRateQueue() -> Bool {
        guard let data = try? JSONSerialization.data(withJSONObject: heartRateQueue) else {
            heartRateQueueNeedsSave = true
            return false
        }
        var query = heartRateQueueQuery()
        let status: OSStatus
        if SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess {
            status = SecItemUpdate(
                query as CFDictionary,
                [
                    kSecValueData as String: data,
                    kSecAttrAccessible as String:
                        kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
                ] as CFDictionary
            )
        } else {
            query[kSecValueData as String] = data
            query[kSecAttrAccessible as String] =
                kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(query as CFDictionary, nil)
        }
        guard status == errSecSuccess else {
            heartRateQueueNeedsSave = true
            NSLog("Watch heart-rate queue keychain write failed: %d", Int(status))
            return false
        }
        heartRateQueueNeedsSave = false
        UserDefaults.standard.removeObject(forKey: heartRateQueueKey)
        return true
    }

    private func heartRateQueueQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "sparky.watchTelemetry",
            kSecAttrAccount as String: heartRateQueueKey,
        ]
    }

    private func heartRateQueueDataFromKeychain() -> Data? {
        var query = heartRateQueueQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else {
            return nil
        }
        return item as? Data
    }

    /// Same shape `sendEvent` used to build inline. Optional numbers are
    /// omitted rather than stored as null so the queue survives JSON.
    private func heartRateEvent(from payload: [String: Any]) -> [String: Any] {
        var event: [String: Any] = [
            "clientId": payload["clientId"] as? String ?? "",
            "sessionId": payload["sessionId"] as? String ?? "",
            "exerciseEntryId": payload["exerciseEntryId"] as? String ?? "",
            // WatchConnectivity delivers nested dictionaries as NSArray of
            // NSDictionary. `as? [[String: Any]]` often fails on that and
            // would silently drop every sample.
            "samples": dictionaryArray(payload["samples"]),
        ]
        if let kcal = payload["activeEnergyKcal"] as? Double {
            event["activeEnergyKcal"] = kcal
        }
        if let minutes = payload["durationMinutes"] as? Double {
            event["durationMinutes"] = minutes
        }
        return withQueueId(event)
    }

    /// Older watch builds omit `clientId`. A generated id lets the phone ack
    /// the queue entry without becoming the dedupe key JS uses for calories.
    private func withQueueId(_ event: [String: Any]) -> [String: Any] {
        var copy = event
        let clientId = copy["clientId"] as? String ?? ""
        if clientId.isEmpty, (copy["queueId"] as? String ?? "").isEmpty {
            copy["queueId"] = UUID().uuidString
        }
        return copy
    }

    /// Caller holds `heartRateAccess`.
    private func trimHeartRateQueue() {
        var dropped = 0
        while heartRateQueue.count > heartRateQueueBatchLimit {
            heartRateQueue.removeFirst()
            dropped += 1
        }
        while heartRateQueue.count > 1 {
            guard
                let data = try? JSONSerialization.data(withJSONObject: heartRateQueue),
                data.count > heartRateQueueByteLimit
            else { break }
            heartRateQueue.removeFirst()
            dropped += 1
        }
        if dropped > 0 {
            NSLog(
                "Watch heart-rate queue over cap; dropping %d oldest batch(es)",
                dropped
            )
        }
    }

    /// Caller holds `heartRateAccess`.
    private func rememberHeartRateBatch(_ event: [String: Any]) {
        if let clientId = event["clientId"] as? String, !clientId.isEmpty,
           heartRateQueue.contains(where: { ($0["clientId"] as? String) == clientId }) {
            return
        }
        if let encoded = try? JSONSerialization.data(withJSONObject: [event]),
           encoded.count > heartRateQueueByteLimit {
            NSLog(
                "Watch heart-rate batch exceeds %d bytes; not queued",
                heartRateQueueByteLimit
            )
            return
        }
        heartRateQueue.append(event)
        trimHeartRateQueue()
        heartRateQueueNeedsSave = true
        _ = saveHeartRateQueue()
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
