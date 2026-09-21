import Foundation
import Combine

/// In-memory state for the workout currently shown on the Workout tab.
///
/// Walks a flat sequence of sets rather than a list of exercises: the wearer
/// sees one set at a time and pages through them, so the cursor is a position
/// in `steps`. That mirrors the phone's own `buildStepsFromSession`, which is
/// what keeps the two sides describing the same position.
///
/// Persisted across jetsam: watchOS keeps an `HKWorkoutSession` alive after
/// memory-pressure kills, but our delegates and this store die with the
/// process. Without a snapshot the Workout tab would relaunch empty against
/// a still-running HK session, and every buffered sample would have no
/// exercise to tag. Sets still queue through WatchConnectivity; this snapshot
/// is what lets the wearer keep going on the same plan after the relaunch.
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

    private let defaults = UserDefaults.standard
    private let snapshotKey = "sparky.watch.workoutSnapshot"
    /// Previews share this process's UserDefaults; they must not write a
    /// snapshot that the next real launch would restore as a live workout.
    private let persistEnabled: Bool

    private init(persistEnabled: Bool = true) {
        self.persistEnabled = persistEnabled
    }

    #if DEBUG
    /// A detached instance for Xcode previews. Canvases in one process share
    /// `shared`, so without this one preview's started workout leaks into the
    /// next one's "no workout" state.
    static func previewInstance() -> WorkoutSessionStore {
        WorkoutSessionStore(persistEnabled: false)
    }
    #endif

    var isActive: Bool { plan != nil }

    var currentStep: WorkoutStep? {
        steps.indices.contains(currentStepIndex) ? steps[currentStepIndex] : nil
    }

    var isResting: Bool { restEndsAt != nil }

    /// Values to show for a set: whatever was typed, falling back to the plan.
    func values(for step: WorkoutStep) -> SetValues {
        let edited = editedValues[step.plannedSet.setId]
        return SetValues(
            weightKg: edited?.weightKg ?? step.plannedSet.targetWeightKg,
            reps: edited?.reps ?? step.plannedSet.targetReps
        )
    }

    func isCompleted(_ step: WorkoutStep) -> Bool {
        completedSetIds.contains(step.plannedSet.setId)
    }

    func start(with plan: ActiveWorkoutPlan) {
        self.plan = plan
        let flattened = plan.exercises.flatMap { exercise in
            exercise.sets.enumerated().map { index, set in
                WorkoutStep(
                    exerciseEntryId: exercise.exerciseEntryId,
                    exerciseName: exercise.name,
                    plannedSet: set,
                    setNumber: index + 1,
                    setCount: exercise.sets.count
                )
            }
        }
        if plan.setOrder.isEmpty {
            steps = flattened
        } else {
            let byId = Dictionary(
                flattened.map { ($0.plannedSet.setId, $0) },
                uniquingKeysWith: { first, _ in first }
            )
            let ordered = plan.setOrder.compactMap { byId[$0] }
            steps = ordered.isEmpty ? flattened : ordered
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
        persistSnapshot(reportedEnergyKcal: 0)
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
        clearSnapshot()
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
        persistSnapshot(reportedEnergyKcal: nil)
    }

    /// Marks the current set done, starts the next set's rest, and advances
    /// the cursor. Returns the step that was completed so the caller can
    /// report it — the store never talks to the phone itself.
    @discardableResult
    func completeCurrentSet() -> WorkoutStep? {
        guard let step = currentStep, !isCompleted(step) else { return nil }
        completedSetIds.insert(step.plannedSet.setId)

        if currentStepIndex + 1 < steps.count {
            currentStepIndex += 1
            // Phone rest is *before the next set* (`nextStep.restSec`). Using
            // the completed set's rest inverted per-set rest and supersets.
            let nextRest = steps[currentStepIndex].plannedSet.restSeconds
            if nextRest > 0 {
                startRest(seconds: nextRest)
            }
        } else {
            // Past the last set so `currentStep` is nil and the UI can show
            // "Workout complete" instead of a rest timer with no way out.
            currentStepIndex = steps.count
        }
        persistSnapshot(reportedEnergyKcal: nil)
        return step
    }

    /// How many of an exercise's sets are logged, for the picker's subtitle.
    ///
    /// `filter {}.count` rather than `count(where:)`: the latter is a Swift 6
    /// stdlib addition gated on watchOS 11, and this target deploys to 10.0.
    func completedSetCount(for exercise: PlannedExercise) -> Int {
        exercise.sets.filter { completedSetIds.contains($0.setId) }.count
    }

    func isComplete(_ exercise: PlannedExercise) -> Bool {
        !exercise.sets.isEmpty && completedSetCount(for: exercise) == exercise.sets.count
    }

    /// Moves the cursor to an exercise chosen from the picker, landing on its
    /// first set that still needs doing — coming back to a half-finished
    /// exercise should resume it, not restart it. Falls back to its first set
    /// when every one is already logged.
    func jumpToExercise(_ exerciseEntryId: String) {
        let owned = steps.indices.filter { steps[$0].exerciseEntryId == exerciseEntryId }
        guard let first = owned.first else { return }
        stopRestTimer()
        currentStepIndex = owned.first { !isCompleted(steps[$0]) } ?? first
        persistSnapshot(reportedEnergyKcal: nil)
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

    // MARK: - Jetsam snapshot

    /// What we write to disk so a relaunch can pick the workout back up.
    /// `reportedEnergyKcal` is owned by `WatchSessionManager` (it is "what we
    /// have already sent", not UI) but it has to travel with the plan: a
    /// reset-to-zero after recover would send the running total as a fresh
    /// delta and double calories.
    struct Snapshot: Codable {
        var plan: ActiveWorkoutPlan
        var currentStepIndex: Int
        var completedSetIds: [String]
        var editedValues: [String: SetValues]
        var startedAt: Date
        var reportedEnergyKcal: Double
    }

    /// Last energy high-water mark we persisted. WatchSessionManager reads
    /// this after `restoreSnapshot` so it does not have to keep a parallel
    /// UserDefaults key.
    private(set) var restoredReportedEnergyKcal: Double = 0

    /// Writes the live plan. Pass `reportedEnergyKcal` when the caller just
    /// sent a batch; pass nil to keep whatever was last stored (set complete,
    /// cursor move) so we do not zero the high-water mark from a UI event.
    func persistSnapshot(reportedEnergyKcal: Double?) {
        guard persistEnabled, let plan, let startedAt else { return }
        let energy: Double
        if let reportedEnergyKcal {
            energy = reportedEnergyKcal
            restoredReportedEnergyKcal = reportedEnergyKcal
        } else {
            energy = restoredReportedEnergyKcal
        }
        let snapshot = Snapshot(
            plan: plan,
            currentStepIndex: currentStepIndex,
            completedSetIds: Array(completedSetIds),
            editedValues: editedValues,
            startedAt: startedAt,
            reportedEnergyKcal: energy
        )
        if let data = try? JSONEncoder().encode(snapshot) {
            defaults.set(data, forKey: snapshotKey)
        }
    }

    /// Rehydrates a jetsam'd workout. Returns the snapshot so the session
    /// manager can rebind HealthKit and restore its energy high-water mark.
    /// No-op (and returns nil) when there is nothing stored.
    @discardableResult
    func restoreSnapshot() -> Snapshot? {
        guard persistEnabled,
              let data = defaults.data(forKey: snapshotKey),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data)
        else { return nil }
        start(with: snapshot.plan)
        // `start(with:)` resets cursor / completions / energy and writes a
        // fresh snapshot; put the recovered progress back on top.
        currentStepIndex = min(snapshot.currentStepIndex, steps.count)
        completedSetIds = Set(snapshot.completedSetIds)
        editedValues = snapshot.editedValues
        startedAt = snapshot.startedAt
        elapsedSeconds = max(0, Int(Date().timeIntervalSince(snapshot.startedAt)))
        restoredReportedEnergyKcal = snapshot.reportedEnergyKcal
        persistSnapshot(reportedEnergyKcal: snapshot.reportedEnergyKcal)
        return snapshot
    }

    func clearSnapshot() {
        restoredReportedEnergyKcal = 0
        guard persistEnabled else { return }
        defaults.removeObject(forKey: snapshotKey)
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
        if let elapsedTimer {
            RunLoop.main.add(elapsedTimer, forMode: .common)
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
        if let restTimer {
            RunLoop.main.add(restTimer, forMode: .common)
        }
    }

    private func stopRestTimer() {
        restTimer?.invalidate()
        restTimer = nil
        restEndsAt = nil
        restDurationSeconds = 0
    }
}
