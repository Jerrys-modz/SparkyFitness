import Foundation

/// Wire contract mirrored from the phone app. Keep these in lockstep with
/// `src/types/watchBridge.ts` on the JS side — field names and optionality
/// must match exactly, since this just `Codable`-decodes whatever JSON
/// `WatchConnectivity.updateContext` last sent.

struct WatchTodayPayload: Codable {
    let date: String
    let food: Double
    let burned: Double
    let goal: Double
    let remaining: Double
    /// 0-1, already clamped by the sender.
    let progress: Double
    let protein: Double
    let carbs: Double
    let fat: Double
}

struct WatchPresetSummary: Codable, Identifiable, Equatable {
    let id: Int
    let name: String
    let exerciseCount: Int
}

struct WatchSetDot: Codable, Identifiable, Equatable {
    let id: String
    let completed: Bool
    let isActive: Bool
}

struct WatchRestState: Codable, Equatable {
    let state: String // "ready" | "resting" | "paused"
    let durationSec: Int
    /// Epoch ms; non-nil only while `state == "resting"`.
    let endsAt: Double?
}

struct WatchActiveWorkoutPayload: Codable, Equatable {
    let sessionId: String
    let workoutName: String
    let exerciseName: String
    let setNumber: Int
    let setCount: Int
    let activeSetId: String?
    let targetReps: Int?
    let targetWeight: Double?
    let weightUnit: String // "kg" | "lbs"
    let setDots: [WatchSetDot]
    let rest: WatchRestState
    /// Epoch ms.
    let startedAt: Double?
    let isFinished: Bool
}

struct WatchAppContext: Codable {
    let today: WatchTodayPayload?
    let presets: [WatchPresetSummary]?
    let activeWorkout: WatchActiveWorkoutPayload?
    let serverConnected: Bool?
    let generatedAt: Double?

    static let empty = WatchAppContext(today: nil, presets: [], activeWorkout: nil, serverConnected: false, generatedAt: nil)
}

/// Commands sent watch → phone. Each case is self-contained (carries every
/// value it needs) rather than assuming the phone remembers the watch's last
/// received context — the two can race or arrive out of order.
enum WatchCommand {
    case startPreset(presetId: Int)
    case logSet(setId: String, reps: Int?, weight: Double?, weightUnit: String)
    case skipRest
    case adjustRest(deltaSec: Int)
    case finishWorkout
    case requestSync

    var payload: [String: Any] {
        switch self {
        case .startPreset(let presetId):
            return ["type": "startPreset", "presetId": presetId]
        case .logSet(let setId, let reps, let weight, let weightUnit):
            var dict: [String: Any] = ["type": "logSet", "setId": setId, "weightUnit": weightUnit]
            dict["reps"] = reps ?? NSNull()
            dict["weight"] = weight ?? NSNull()
            return dict
        case .skipRest:
            return ["type": "skipRest"]
        case .adjustRest(let deltaSec):
            return ["type": "adjustRest", "deltaSec": deltaSec]
        case .finishWorkout:
            return ["type": "finishWorkout"]
        case .requestSync:
            return ["type": "requestSync"]
        }
    }
}
