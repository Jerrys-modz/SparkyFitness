import Foundation
import HealthKit

/// Apple's 1-10 workout effort rating (watchOS 11+), shared by the strength
/// and cardio endings so both save it the same way.
enum WorkoutEffort {
    /// The type to ask write access for, nil before watchOS 11.
    static var shareType: HKSampleType? {
        if #available(watchOS 11.0, *) { return HKQuantityType(.workoutEffortScore) }
        return nil
    }

    private static let askedKey = "workoutEffortShareAsked"

    /// The effort type to add to a write request, or nil once it has been asked
    /// for. Health keeps reporting it as never requested, so adding it to every
    /// workout start would show the permission sheet each time.
    static func shareTypeToRequest() -> HKSampleType? {
        guard !UserDefaults.standard.bool(forKey: askedKey) else { return nil }
        return shareType
    }

    /// Records that the request carrying the effort type has been shown.
    static func markShareAsked() {
        UserDefaults.standard.set(true, forKey: askedKey)
    }

    /// True when this watchOS can attach a rating to a saved workout.
    static var isSupported: Bool {
        if #available(watchOS 11.0, *) { return true }
        return false
    }

    /// Attaches `score` (clamped to 1-10) to `workout`, so it shows in Fitness
    /// and Health. Completion is on the main queue with whether it was saved.
    static func save(
        _ score: Int,
        for workout: HKWorkout,
        in healthStore: HKHealthStore,
        completion: @escaping (Bool) -> Void
    ) {
        guard #available(watchOS 11.0, *) else {
            completion(false)
            return
        }
        let sample = HKQuantitySample(
            type: HKQuantityType(.workoutEffortScore),
            quantity: HKQuantity(unit: .appleEffortScore(), doubleValue: Double(min(max(score, 1), 10))),
            start: workout.startDate,
            end: workout.endDate
        )
        // Asked for here, right before the write, rather than when the workout
        // starts: Health does not reliably remember this permission between
        // workouts, and a write without it is refused. The sheet only appears
        // if Health still counts it as unanswered.
        healthStore.requestAuthorization(toShare: [HKQuantityType(.workoutEffortScore)], read: []) { _, _ in
            healthStore.relateWorkoutEffortSample(sample, with: workout, activity: nil) { success, _ in
                DispatchQueue.main.async { completion(success) }
            }
        }
    }
}
