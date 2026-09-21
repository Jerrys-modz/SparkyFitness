import Foundation
import HealthKit

/// Wraps HKWorkoutSession/HKLiveWorkoutBuilder — the watch's own workout
/// engine — so the rest of the app deals in plain heart-rate callbacks
/// instead of HealthKit's session/builder/delegate machinery. Starting a real
/// HKWorkoutSession (rather than only reading heart-rate samples on the side)
/// is what keeps HR sampling running in the background and gives the wearer
/// the system's own workout affordances (Dock, complications reflecting an
/// active session) while the app itself isn't in the foreground.
///
/// All delegate callbacks are re-dispatched onto the main queue: HealthKit
/// calls them from its own background queue, and every property here is read
/// from `WorkoutView`'s SwiftUI body.
final class WorkoutHealthKitController: NSObject {
    static let shared = WorkoutHealthKitController()

    /// Fired on every fresh HR reading HealthKit reports, for the header's
    /// live BPM. Always called on the main queue.
    var onHeartRate: ((Double) -> Void)?
    /// Fired periodically with whatever samples accumulated since the last
    /// flush, for `heartRateBatch` transfers. Always called on the main queue.
    var onBatchReady: (([HeartRateSample]) -> Void)?
    /// Running active energy for this workout, in kcal. Always called on the
    /// main queue.
    var onActiveEnergy: ((Double) -> Void)?

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var pendingSamples: [HeartRateSample] = []
    private var batchTimer: Timer?
    private let instantFormatter = ISO8601DateFormatter()

    /// How often accumulated samples are flushed to `onBatchReady`.
    ///
    /// A minute rather than ten seconds because batches are QUEUED now
    /// (`WatchSessionManager.sendHeartRateBatch`) instead of dropped when the
    /// phone is out of range: nothing is lost by batching less often, and an
    /// hour's workout costs ~60 queued transfers rather than ~360.
    private static let batchInterval: TimeInterval = 60

    /// Stamped onto every workout this app saves to HealthKit, so the phone's
    /// inbound sync can recognise its own writes and skip them.
    ///
    /// Duplicated as a literal in
    /// `src/services/healthkit/dataTransformation.ts` — a Swift watch target
    /// and a React Native module have no way to share a constant, the same
    /// reason `WatchDeepLink.scheme` exists in three places. Renaming it here
    /// without renaming it there silently reintroduces duplicate workouts.
    ///
    /// A metadata key rather than the source bundle id because the watch app's
    /// bundle (`<phone>.watchkitapp`) is not the phone's, so the existing
    /// `isOwnRecord` bundle comparison would never match a workout written
    /// from the wrist.
    static let sessionMetadataKey = "SparkyFitnessSessionId"

    private var heartRateType: HKQuantityType { HKQuantityType(.heartRate) }
    private var activeEnergyType: HKQuantityType { HKQuantityType(.activeEnergyBurned) }

    private override init() {
        super.init()
    }

    func requestAuthorization(completion: @escaping (Bool) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            DispatchQueue.main.async { completion(false) }
            return
        }
        let shareTypes: Set<HKSampleType> = [
            HKObjectType.workoutType(), heartRateType, activeEnergyType,
        ]
        let readTypes: Set<HKObjectType> = [
            heartRateType, activeEnergyType, HKObjectType.workoutType(),
        ]
        healthStore.requestAuthorization(toShare: shareTypes, read: readTypes) { success, _ in
            DispatchQueue.main.async { completion(success) }
        }
    }

    /// Starts a real workout session, defaulting to strength training — this
    /// app has no per-exercise activity-type mapping yet, and traditional
    /// strength training is the closest built-in `HKWorkoutActivityType` to a
    /// preset session's mix of exercises. Close enough to unlock background HR
    /// sampling and the system workout UI; a no-op if a session is already
    /// running or HealthKit isn't available (the Workout tab still functions
    /// as a plain timer/set tracker either way, just without live HR).
    /// - Parameter sessionId: the Sparky live-workout session this belongs to,
    ///   stamped into the saved workout's metadata as the own-write marker.
    func start(sessionId: String) {
        guard HKHealthStore.isHealthDataAvailable(), session == nil else { return }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor

        do {
            let newSession = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let newBuilder = newSession.associatedWorkoutBuilder()
            newBuilder.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: configuration
            )
            newSession.delegate = self
            newBuilder.delegate = self

            session = newSession
            builder = newBuilder

            let now = Date()
            newSession.startActivity(with: now)
            // Metadata must be added during an active collection — firing it
            // in parallel with beginCollection raced and could drop the
            // own-write marker the phone uses to skip this workout on sync.
            newBuilder.beginCollection(withStart: now) { success, _ in
                guard success else { return }
                newBuilder.addMetadata([Self.sessionMetadataKey: sessionId]) { _, _ in }
            }
            startBatchTimer()
        } catch {
            session = nil
            builder = nil
        }
    }

    /// Ends the session and RETURNS whatever samples were still buffered,
    /// rather than pushing them through `onBatchReady`.
    ///
    /// That callback hops to the main actor via `Task { @MainActor in }`, so
    /// a final flush routed through it would run after the caller had already
    /// torn the workout down — `WatchSessionManager.endWorkout` clears the
    /// store synchronously, and the batch would then find no session to tag
    /// itself with and be dropped. Handing the samples back lets the caller
    /// send them while the session is still standing.
    @discardableResult
    func stop() -> [HeartRateSample] {
        stopBatchTimer()
        let remaining = pendingSamples
        pendingSamples = []
        guard let session else { return remaining }
        // Keep the builder alive until finishWorkout runs. Nilling `self.builder`
        // synchronously used to make the completion a no-op, so nothing was
        // saved to Health and the own-write marker never persisted.
        let endingBuilder = builder
        let now = Date()
        session.end()
        endingBuilder?.endCollection(withEnd: now) { _, _ in
            endingBuilder?.finishWorkout { _, _ in }
        }
        self.session = nil
        self.builder = nil
        return remaining
    }

    private func startBatchTimer() {
        batchTimer?.invalidate()
        batchTimer = Timer.scheduledTimer(withTimeInterval: Self.batchInterval, repeats: true) { [weak self] _ in
            self?.flush()
        }
        if let batchTimer {
            RunLoop.main.add(batchTimer, forMode: .common)
        }
    }

    private func stopBatchTimer() {
        batchTimer?.invalidate()
        batchTimer = nil
    }

    /// Hands the buffer to `WatchSessionManager.sendHeartRateBatch`, EVEN WHEN
    /// IT IS EMPTY.
    ///
    /// Active energy rides along on these batches but is read from the store
    /// rather than this buffer, so bailing out on no samples used to mean a
    /// wearer who granted energy but refused heart rate sent nothing at all
    /// for the whole workout — despite the payload, the route and the phone's
    /// flush all supporting energy without a series. Whether there is anything
    /// worth sending is decided one level up, which is the only place that can
    /// see both halves.
    private func flush() {
        let batch = pendingSamples
        pendingSamples = []
        onBatchReady?(batch)
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutHealthKitController: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        // Strength-training sessions auto-pause when the wearer is still
        // (rest between sets). Leaving them paused stops HR for the rest of
        // the workout. Resume immediately so sampling survives rest.
        if toState == .paused {
            workoutSession.resume()
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.session = nil
            self?.builder = nil
            self?.stopBatchTimer()
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutHealthKitController: HKLiveWorkoutBuilderDelegate {
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        if collectedTypes.contains(heartRateType),
           let statistics = workoutBuilder.statistics(for: heartRateType),
           let bpm = statistics.mostRecentQuantity()?
               .doubleValue(for: HKUnit.count().unitDivided(by: .minute())) {
            // The reading's OWN instant, not `Date()` at delivery time.
            // HealthKit hands these over in bursts, so stamping them on
            // arrival would bunch a spread of readings onto nearly the same
            // moment - and the server derives each zone's duration from the
            // gaps between samples, so a compressed timeline silently
            // misreports how long was spent in every zone.
            let sampledAt = statistics.mostRecentQuantityDateInterval()?.end ?? Date()
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                let sample = HeartRateSample(
                    t: self.instantFormatter.string(from: sampledAt),
                    bpm: bpm
                )
                self.pendingSamples.append(sample)
                self.onHeartRate?(bpm)
            }
        }

        // Cumulative for the whole workout, not an instantaneous reading, so
        // it is read as a running sum rather than a most-recent value.
        if collectedTypes.contains(activeEnergyType),
           let statistics = workoutBuilder.statistics(for: activeEnergyType),
           let kcal = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) {
            DispatchQueue.main.async { [weak self] in
                self?.onActiveEnergy?(kcal)
            }
        }
    }
}
