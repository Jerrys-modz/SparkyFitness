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

    #if DEBUG
    /// Simulator stand-in for the wrist sensors; see `SyntheticWorkoutSignal`.
    private var syntheticTimer: Timer?
    private var syntheticStartedAt: Date?
    private var syntheticEnergyKcal: Double = 0
    #endif

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
        #if DEBUG
        // The synthetic source never touches the health store, so there is
        // nothing to authorize. Answering yes here rather than at the call
        // site keeps `WatchSessionManager.handle(workoutStart:)` on exactly
        // the branch it takes in production, prompt and all.
        if SyntheticWorkoutSignal.isEnabled {
            DispatchQueue.main.async { completion(true) }
            return
        }
        #endif
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
        #if DEBUG
        if SyntheticWorkoutSignal.isEnabled {
            startSynthetic()
            return
        }
        #endif
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
            newBuilder.beginCollection(withStart: now) { _, _ in }
            // Added while collecting rather than at finish: builder metadata
            // is saved with the workout either way, and doing it here keeps
            // `stop()` from nesting another completion handler.
            newBuilder.addMetadata([Self.sessionMetadataKey: sessionId]) { _, _ in }
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
        #if DEBUG
        stopSynthetic()
        #endif
        stopBatchTimer()
        let remaining = pendingSamples
        pendingSamples = []
        guard let session else { return remaining }
        let now = Date()
        session.end()
        builder?.endCollection(withEnd: now) { [weak self] _, _ in
            self?.builder?.finishWorkout { _, _ in }
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
    }

    private func stopBatchTimer() {
        batchTimer?.invalidate()
        batchTimer = nil
    }

    private func flush() {
        guard !pendingSamples.isEmpty else { return }
        let batch = pendingSamples
        pendingSamples = []
        onBatchReady?(batch)
    }

    #if DEBUG
    /// Runs `SyntheticWorkoutSignal` in place of HealthKit, into the same
    /// buffer and the same batch timer the real readings use — so a simulator
    /// run exercises the shipping batching, timestamping and flush code rather
    /// than a second copy of it.
    private func startSynthetic() {
        guard syntheticTimer == nil else { return }
        syntheticStartedAt = Date()
        syntheticEnergyKcal = 0
        startBatchTimer()
        syntheticTimer = Timer.scheduledTimer(
            withTimeInterval: SyntheticWorkoutSignal.sampleInterval,
            repeats: true
        ) { [weak self] _ in
            self?.emitSyntheticReading()
        }
    }

    private func stopSynthetic() {
        syntheticTimer?.invalidate()
        syntheticTimer = nil
        syntheticStartedAt = nil
    }

    /// The timer fires on the main run loop, which is where the HealthKit path
    /// hands its readings over too, so this appends directly instead of
    /// dispatching again.
    private func emitSyntheticReading() {
        guard let startedAt = syntheticStartedAt else { return }
        let now = Date()
        let bpm = SyntheticWorkoutSignal.bpm(atElapsed: now.timeIntervalSince(startedAt))
        pendingSamples.append(
            HeartRateSample(t: instantFormatter.string(from: now), bpm: bpm)
        )
        onHeartRate?(bpm)

        // Cumulative, matching what the real path reads off the builder's
        // `sumQuantity` — `WatchSessionManager` is what turns it into the
        // per-batch delta, and that arithmetic is part of what is under test.
        syntheticEnergyKcal += SyntheticWorkoutSignal.energyDelta(
            bpm: bpm,
            over: SyntheticWorkoutSignal.sampleInterval
        )
        onActiveEnergy?(syntheticEnergyKcal)
    }
    #endif
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutHealthKitController: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        // Nothing to react to today: WorkoutSessionStore's own start()/reset()
        // already drive the UI, independent of HealthKit's session lifecycle.
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
