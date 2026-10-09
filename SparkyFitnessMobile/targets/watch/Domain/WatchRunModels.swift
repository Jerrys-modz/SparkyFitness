import Foundation
import HealthKit

/// What the wearer is recording from the wrist alone. Indoor only for now:
/// there is no route, and the distance is the watch's own estimate from its
/// motion sensors. Raw values are for logging, not the wire.
enum WatchRunKind: String {
    case walk, run

    var title: String {
        switch self {
        case .walk: return "Indoor walk"
        case .run: return "Indoor run"
        }
    }

    var symbol: String {
        switch self {
        case .walk: return "figure.walk"
        case .run: return "figure.run"
        }
    }

    var activityType: HKWorkoutActivityType {
        switch self {
        case .walk: return .walking
        case .run: return .running
        }
    }
}

/// The figures shown while a wrist-only recording runs, and kept for the
/// summary after it ends.
struct WatchRunMetrics: Equatable {
    var distanceMeters: Double = 0
    var activeEnergyKcal: Double = 0
    var heartRate: Double?

    /// Seconds per kilometer or mile over the whole recording so far, or nil
    /// until there is enough distance for it to mean anything (an indoor
    /// estimate starts at zero and creeps up).
    static func paceSeconds(elapsed: TimeInterval, distanceMeters: Double, usesMiles: Bool) -> Double? {
        let unitMeters = usesMiles ? 1609.344 : 1000.0
        guard distanceMeters >= 50, elapsed > 0 else { return nil }
        return elapsed / (distanceMeters / unitMeters)
    }

    static func distanceText(_ meters: Double, usesMiles: Bool) -> String {
        let unitMeters = usesMiles ? 1609.344 : 1000.0
        return String(format: "%.2f", meters / unitMeters)
    }

    static func paceText(_ pace: Double?) -> String {
        guard let pace, pace > 0, pace < 3600 else { return "--:--" }
        let total = Int(pace.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
