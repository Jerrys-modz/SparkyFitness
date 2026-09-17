import Foundation

/// Turns domain values into the dictionaries WatchConnectivity carries to the
/// phone.
///
/// These `payload` builders used to be computed properties on `CheckIn`,
/// `WaterTap` and `WaterDeleteRequest` themselves, which meant the domain
/// types knew their own wire format — a check-in had an opinion about the
/// string `"weightKg"`. Moving them here leaves those types as plain values
/// and puts every outbound key in one place, next to the `type` strings the
/// phone's router switches on.
///
/// The counterpart for the other direction is `ContextPayloadMapper`.
enum OutboundPayloads {

    /// Message types, matched by the phone's native module router
    /// (`WatchConnectivityModule.route`). Renaming one here without renaming
    /// it there means the phone silently ignores the message.
    private enum Kind {
        static let checkIn = "checkIn"
        static let waterIntake = "waterIntake"
        static let waterDelete = "waterDelete"
        static let contextRequest = "requestContext"
        static let setCompleted = "setCompleted"
        static let heartRateBatch = "heartRateBatch"
        static let workoutStop = "workoutStop"
    }

    /// A morning check-in awaiting a server write.
    ///
    /// `bodyFatPercentage` is OMITTED rather than sent as null when the wearer
    /// skipped it: the server upserts by date, so a null would erase whatever
    /// body-fat value the day already had instead of leaving it alone.
    static func checkIn(_ checkIn: CheckIn) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.checkIn,
            "clientId": checkIn.id,
            "entryDate": checkIn.entryDate,
            "weightKg": checkIn.weightKg,
        ]
        if let bodyFat = checkIn.bodyFatPercentage {
            payload["bodyFatPercentage"] = bodyFat
        }
        return payload
    }

    /// One tap on a container square — the phone turns this into one serving
    /// of `containerId`, the same amount its own +/- button would add.
    static func waterTap(_ tap: WaterTap) -> [String: Any] {
        [
            "type": Kind.waterIntake,
            "clientId": tap.id,
            "entryDate": tap.entryDate,
            "containerId": tap.containerId,
        ]
    }

    /// A request to delete one logged drink by its server row id.
    static func waterDelete(_ request: WaterDeleteRequest) -> [String: Any] {
        [
            "type": Kind.waterDelete,
            "clientId": request.id,
            "entryId": request.entryId,
        ]
    }

    /// Asks the phone to push a fresh context. Carries no data of its own.
    static let contextRequest: [String: Any] = ["type": Kind.contextRequest]

    /// One set logged during an active workout. Delivery must not be lost —
    /// unlike a heart-rate sample, a dropped set is a hole in the diary the
    /// wearer would have no way to notice — so this is sent via
    /// `WatchSessionManager.transfer(_:)`'s queued path, not `sendMessage`
    /// directly.
    static func setCompleted(_ completedSet: CompletedSet) -> [String: Any] {
        [
            "type": Kind.setCompleted,
            "clientId": completedSet.clientId,
            "sessionId": completedSet.sessionId,
            "setId": completedSet.setId,
        ]
    }

    /// A batch of heart-rate samples for one exercise. Sent live via
    /// `sendMessage` rather than the queued path: a batch that fails to reach
    /// an unreachable phone is a small, bounded loss of HR fidelity for that
    /// stretch, not a missing set — not worth resending stale readings once
    /// the phone comes back.
    static func heartRateBatch(_ batch: HeartRateBatch) -> [String: Any] {
        [
            "type": Kind.heartRateBatch,
            "sessionId": batch.sessionId,
            "exerciseEntryId": batch.exerciseEntryId,
            "samples": batch.samples.map { ["t": $0.t, "bpm": $0.bpm] },
        ]
    }

    /// The wearer ended the workout on the watch. Queued like `setCompleted`:
    /// this is what tells the phone to flush buffered heart rate against the
    /// session's exercise entries, and a phone that misses it entirely would
    /// leave that heart rate stranded on the watch forever.
    static func workoutStop(_ signal: WorkoutStopSignal) -> [String: Any] {
        [
            "type": Kind.workoutStop,
            "sessionId": signal.sessionId,
        ]
    }
}
