import Foundation
import Combine

/// In-memory state for the workout currently shown on the Workout tab.
///
/// Walks a flat sequence of sets rather than a list of exercises: the wearer
/// sees one set at a time and pages through them, so the cursor is a position
/// in `steps`. That mirrors the phone's own `buildStepsFromSession`, which is
/// what keeps the two sides describing the same position.
///
/// Deliberately NOT persisted the way `CheckInStore` is: the phone is already
/// the durable record here (`WatchSessionManager.transfer(_:)` queues each
/// `setCompleted` individually, so a set survives even if the watch app is
/// later killed), so there is nothing this store alone holds that would be
/// worth recovering after a relaunch.
@MainActor
final class WorkoutSessionStore: ObservableObject {
    static let shared = WorkoutSessionStore()

    @Published private(set) var plan: ActiveWorkoutPlan?
    /// Every set of every exercise, in the order they are meant to be done.
    @Published private(set) var steps: [WorkoutStep] = []
    @Published private(set) var currentStepIndex: Int = 0
    @Published private(set) var completedSetIds: Set<String> = []
    /// Edited weight/reps by set id. A set with no entry here is still on its
    /// planned targets.
    @Published private(set) var editedValues: [String: SetValues] = [:]
    @Published private(set) var latestBpm: Double?
    @Published private(set) var activeEnergyKcal: Double?
    @Published private(set) var elapsedSeconds: Int = 0
    /// Non-nil while a rest countdown is running before the next set.
    @Published private(set) var restEndsAt: Date?
    /// The rest's full length, so the progress bar has a denominator.
    @Published private(set) var restDurationSeconds: Int = 0

    private var elapsedTimer: Timer?
    private var restTimer: Timer?
    private var startedAt: Date?

    private init() {}

    #if DEBUG
    /// A detached instance for Xcode previews. Canvases in one process share
    /// `shared`, so without this one preview's started workout leaks into the
    /// next one's "no workout" state.
    static func previewInstance() -> WorkoutSessionStore { WorkoutSessionStore() }
    #endif

    var isActive: Bool { plan != nil }

    var currentStep: WorkoutStep? {
        steps.indices.contains(currentStepIndex) ? steps[currentStepIndex] : nil
    }

    var isResting: Bool { restEndsAt != nil }

    /// Values to show for a set: whatever was typed, falling back to the plan.
    func values(for step: WorkoutStep) -> SetValues {
        let edited = editedValues[step.set.setId]
        return SetValues(
            weightKg: edited?.weightKg ?? step.set.targetWeightKg,
            reps: edited?.reps ?? step.set.targetReps
        )
    }

    func isCompleted(_ step: WorkoutStep) -> Bool {
        completedSetIds.contains(step.set.setId)
    }

    func start(with plan: ActiveWorkoutPlan) {
        self.plan = plan
        steps = plan.exercises.flatMap { exercise in
            exercise.sets.enumerated().map { index, set in
                WorkoutStep(
                    exerciseEntryId: exercise.exerciseEntryId,
                    exerciseName: exercise.name,
                    set: set,
                    setNumber: index + 1,
                    setCount: exercise.sets.count
                )
            }
        }
        currentStepIndex = 0
        completedSetIds = []
        editedValues = [:]
        latestBpm = nil
        activeEnergyKcal = nil
        elapsedSeconds = 0
        stopRestTimer()
        startedAt = Date()
        startElapsedTimer()
    }

    /// Clears local state. Does not itself notify the phone — callers that
    /// mean "the wearer ended this" send `workoutStop` separately.
    func reset() {
        plan = nil
        steps = []
        currentStepIndex = 0
        completedSetIds = []
        editedValues = [:]
        latestBpm = nil
        activeEnergyKcal = nil
        elapsedSeconds = 0
        startedAt = nil
        stopElapsedTimer()
        stopRestTimer()
    }

    func recordHeartRate(bpm: Double) {
        latestBpm = bpm
    }

    func recordActiveEnergy(kcal: Double) {
        activeEnergyKcal = kcal
    }

    /// Overrides one value on a set. Passing nil leaves that field alone, so
    /// the keypad can commit weight and reps independently.
    func setValue(for setId: String, weightKg: Double? = nil, reps: Double? = nil) {
        var values = editedValues[setId] ?? SetValues()
        if let weightKg { values.weightKg = weightKg }
        if let reps { values.reps = reps }
        editedValues[setId] = values
    }

    /// Marks the current set done, starts its rest, and advances the cursor.
    /// Returns the step that was completed so the caller can report it — the
    /// store never talks to the phone itself.
    @discardableResult
    func completeCurrentSet() -> WorkoutStep? {
        guard let step = currentStep, !isCompleted(step) else { return nil }
        completedSetIds.insert(step.set.setId)

        if currentStepIndex + 1 < steps.count {
            currentStepIndex += 1
        }
        if step.set.restSeconds > 0 {
            startRest(seconds: step.set.restSeconds)
        }
        return step
    }

    func goToNextStep() {
        guard currentStepIndex + 1 < steps.count else { return }
        stopRestTimer()
        currentStepIndex += 1
    }

    func goToPreviousStep() {
        guard currentStepIndex > 0 else { return }
        stopRestTimer()
        currentStepIndex -= 1
    }

    func skipRest() {
        stopRestTimer()
    }

    /// The ±15s controls on the rest screen. Dropping to zero or below just
    /// ends the rest, same as skipping.
    func adjustRest(bySeconds delta: Int) {
        guard let endsAt = restEndsAt else { return }
        let newEndsAt = endsAt.addingTimeInterval(TimeInterval(delta))
        guard newEndsAt > Date() else {
            stopRestTimer()
            return
        }
        restEndsAt = newEndsAt
        restDurationSeconds = max(1, restDurationSeconds + delta)
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
        restEndsAt = Date().addingTimeInterval(TimeInterval(seconds))
        restDurationSeconds = seconds
        restTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let endsAt = self.restEndsAt else { return }
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
        restDurationSeconds = 0
    }
}
