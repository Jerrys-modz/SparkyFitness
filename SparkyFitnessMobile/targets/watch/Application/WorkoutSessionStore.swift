import Foundation
import Combine

/// In-memory state for the workout currently shown on the Workout tab.
///
/// Deliberately NOT persisted the way `CheckInStore` is: the phone is already
/// the durable record here (`WatchSessionManager.transfer(_:)` queues each
/// `setCompleted` individually, so a set survives even if the watch app is
/// later killed), so there is nothing this store alone holds that would be
/// worth recovering after a relaunch. A relaunch mid-workout simply waits for
/// the phone to answer `requestContext()`-style — in practice the wearer
/// re-opens Workout and taps Start again only if the phone-side session is
/// itself gone.
@MainActor
final class WorkoutSessionStore: ObservableObject {
    static let shared = WorkoutSessionStore()

    @Published private(set) var plan: ActiveWorkoutPlan?
    @Published private(set) var currentExerciseIndex: Int = 0
    @Published private(set) var completedSetIds: Set<String> = []
    @Published private(set) var latestBpm: Double?
    @Published private(set) var elapsedSeconds: Int = 0
    /// Non-nil while a rest countdown is running before the next set.
    @Published private(set) var restEndsAt: Date?

    private var elapsedTimer: Timer?
    private var restTimer: Timer?
    private var startedAt: Date?

    private init() {}

    var isActive: Bool { plan != nil }

    var currentExercise: PlannedExercise? {
        guard let plan, plan.exercises.indices.contains(currentExerciseIndex) else {
            return nil
        }
        return plan.exercises[currentExerciseIndex]
    }

    /// True once every set of the current exercise is checked off — the cue
    /// to show "next exercise" rather than another set row.
    var isCurrentExerciseDone: Bool {
        guard let exercise = currentExercise, !exercise.sets.isEmpty else { return false }
        return exercise.sets.allSatisfy { completedSetIds.contains($0.setId) }
    }

    var isLastExercise: Bool {
        guard let plan else { return true }
        return currentExerciseIndex >= plan.exercises.count - 1
    }

    func start(with plan: ActiveWorkoutPlan) {
        self.plan = plan
        currentExerciseIndex = 0
        completedSetIds = []
        latestBpm = nil
        elapsedSeconds = 0
        restEndsAt = nil
        startedAt = Date()
        startElapsedTimer()
    }

    /// Clears local state. Does not itself notify the phone — callers that
    /// mean "the wearer ended this" send `workoutStop` separately.
    func reset() {
        plan = nil
        currentExerciseIndex = 0
        completedSetIds = []
        latestBpm = nil
        elapsedSeconds = 0
        startedAt = nil
        stopElapsedTimer()
        stopRestTimer()
    }

    func recordHeartRate(bpm: Double) {
        latestBpm = bpm
    }

    /// Marks a set done locally and starts its rest, if any. The caller is
    /// responsible for telling the phone — this only updates what the watch
    /// itself shows.
    func markSetCompleted(_ set: PlannedSet) {
        guard !completedSetIds.contains(set.setId) else { return }
        completedSetIds.insert(set.setId)
        if set.restSeconds > 0 {
            startRest(seconds: set.restSeconds)
        }
        if isCurrentExerciseDone, !isLastExercise {
            currentExerciseIndex += 1
        }
    }

    func goToNextExercise() {
        guard let plan, currentExerciseIndex + 1 < plan.exercises.count else { return }
        stopRestTimer()
        currentExerciseIndex += 1
    }

    func goToPreviousExercise() {
        guard currentExerciseIndex > 0 else { return }
        stopRestTimer()
        currentExerciseIndex -= 1
    }

    func skipRest() {
        stopRestTimer()
    }

    // MARK: - Timers

    private func startElapsedTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let startedAt = self.startedAt else { return }
                self.elapsedSeconds = Int(Date().timeIntervalSince(startedAt))
            }
        }
    }

    private func stopElapsedTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = nil
    }

    private func startRest(seconds: Int) {
        restTimer?.invalidate()
        let endsAt = Date().addingTimeInterval(TimeInterval(seconds))
        restEndsAt = endsAt
        restTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if Date() >= endsAt {
                    self.stopRestTimer()
                }
            }
        }
    }

    private func stopRestTimer() {
        restTimer?.invalidate()
        restTimer = nil
        restEndsAt = nil
    }
}
