import Foundation
import HealthKit

/// An indoor walk or run recorded on the wrist alone.
///
/// A real `HKWorkoutSession` with `locationType = .indoor`, so the watch
/// estimates distance from its motion sensors and samples heart rate at
/// workout rate. When the wearer finishes, the workout is written to Apple
/// Health; the phone's existing HealthKit import then files it in the diary
/// like any other watch workout. Nothing is sent over the watch connection,
/// so the phone being out of range changes nothing: Health syncs on its own
/// when the two meet again.
///
/// Deliberately NOT stamped with `SparkyFitnessSessionId`. That marker makes
/// the phone's inbound sync skip a workout because the diary already has it
/// from another route; here the HealthKit import is the only route.
///
/// watchOS runs one workout session at a time, so the store only starts this
/// when neither a strength workout nor a phone-GPS recording holds one.
///
/// A session left running when the app is killed is not re-attached by this
/// controller: it cannot tell whose session it would be recovering.
final class WatchRunHealthKitController: NSObject {
    static let shared = WatchRunHealthKitController()

    /// Called on the main queue when new figures are available.
    var onMetrics: ((WatchRunMetrics) -> Void)?
    /// Called on the main queue when the session ends unexpectedly.
    var onFailure: (() -> Void)?

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var metrics = WatchRunMetrics()

    var hasLiveSession: Bool { session != nil }

    /// Active time so far, with pauses removed.
    var elapsed: TimeInterval { builder?.elapsedTime ?? 0 }

    private override init() {
        super.init()
    }

    private static let distanceType = HKQuantityType(.distanceWalkingRunning)
    private static let energyType = HKQuantityType(.activeEnergyBurned)
    private static let heartRateType = HKQuantityType(.heartRate)

    /// Asks for what a run needs. `success` only means the prompt finished; a
    /// denied share still lets the recording run as a timer, so callers start
    /// regardless.
    func requestAuthorization(completion: @escaping () -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            DispatchQueue.main.async { completion() }
            return
        }
        let share: Set<HKSampleType> = [
            HKObjectType.workoutType(), Self.distanceType, Self.energyType, Self.heartRateType,
        ]
        let read: Set<HKObjectType> = [
            HKObjectType.workoutType(), Self.distanceType, Self.energyType, Self.heartRateType,
        ]
        healthStore.requestAuthorization(toShare: share, read: read) { _, _ in
            DispatchQueue.main.async { completion() }
        }
    }

    /// Starts the session. Returns false, leaving nothing running, when
    /// HealthKit is unavailable or a session is already live.
    @discardableResult
    func start(_ kind: WatchRunKind) -> Bool {
        guard HKHealthStore.isHealthDataAvailable(), session == nil else { return false }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = kind.activityType
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
            metrics = WatchRunMetrics()

            let now = Date()
            newSession.startActivity(with: now)
            newBuilder.beginCollection(withStart: now) { _, _ in }
            return true
        } catch {
            session = nil
            builder = nil
            return false
        }
    }

    func pause() {
        session?.pause()
    }

    func resume() {
        session?.resume()
    }

    /// Ends the session and writes the workout to Apple Health (`save`) or
    /// throws it away. `completion` runs on the main queue with the final
    /// figures and the active time.
    func end(save: Bool, completion: @escaping (WatchRunMetrics, TimeInterval) -> Void) {
        guard let session, let endingBuilder = builder else {
            completion(metrics, 0)
            return
        }
        let finalElapsed = endingBuilder.elapsedTime
        self.session = nil
        self.builder = nil
        session.end()
        endingBuilder.endCollection(withEnd: Date()) { [weak self] _, _ in
            if save {
                endingBuilder.finishWorkout { _, _ in }
            } else {
                endingBuilder.discardWorkout()
            }
            DispatchQueue.main.async {
                completion(self?.metrics ?? WatchRunMetrics(), finalElapsed)
            }
        }
    }
}

extension WatchRunHealthKitController: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.session = nil
            self?.builder = nil
            self?.onFailure?()
        }
    }
}

extension WatchRunHealthKitController: HKLiveWorkoutBuilderDelegate {
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        var updated = metrics
        if let distance = workoutBuilder.statistics(for: Self.distanceType)?
            .sumQuantity()?.doubleValue(for: .meter()) {
            updated.distanceMeters = distance
        }
        if let energy = workoutBuilder.statistics(for: Self.energyType)?
            .sumQuantity()?.doubleValue(for: .kilocalorie()) {
            updated.activeEnergyKcal = energy
        }
        if let bpm = workoutBuilder.statistics(for: Self.heartRateType)?
            .mostRecentQuantity()?
            .doubleValue(for: HKUnit.count().unitDivided(by: .minute())), bpm > 0 {
            updated.heartRate = bpm
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.metrics = updated
            self.onMetrics?(updated)
        }
    }
}
