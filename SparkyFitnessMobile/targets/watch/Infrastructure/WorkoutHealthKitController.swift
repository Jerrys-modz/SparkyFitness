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

    /// How often accumulated samples are flushed to `onBatchReady`. Short
    /// enough that a batch lost to an unreachable phone (see
    /// `OutboundPayloads.heartRateBatch`, sent live rather than queued) is a
    /// small gap, long enough not to spam WatchConnectivity with a message
    /// per heartbeat.
    private static let batchInterval: TimeInterval = 10

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
    func start() {
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
            startBatchTimer()
        } catch {
            session = nil
            builder = nil
        }
    }

    /// Ends the session, flushing any samples still buffered so a stop right
    /// after a reading doesn't lose it to the next batch that never comes.
    func stop() {
        stopBatchTimer()
        flush()
        guard let session else { return }
        let now = Date()
        session.end()
        builder?.endCollection(withEnd: now) { [weak self] _, _ in
            self?.builder?.finishWorkout { _, _ in }
        }
        self.session = nil
        self.builder = nil
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
