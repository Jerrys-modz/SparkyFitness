import Foundation
import HealthKit

/// Owns the on-watch `HKWorkoutSession` + `HKLiveWorkoutBuilder` that runs for
/// the duration of a Sparky workout, so the Watch samples real heart rate and
/// saves the finished workout to Apple Health — the same mechanism every
/// other watchOS workout app uses — instead of Sparky inventing its own
/// heart-rate plumbing over WatchConnectivity. The saved HKWorkout (with
/// heart rate statistics) reaches the phone through the existing HealthKit
/// inbound sync (`src/services/healthkit/`), not through the bridge.
///
/// Lifecycle is driven externally by `SparkyFitnessWatchApp`, from the
/// mirrored `activeWorkout` state: `syncToActiveState` starts a session the
/// moment the phone reports a live Sparky workout and ends it the moment
/// that clears, regardless of which tab is on screen. Sparky's rest periods
/// are not HealthKit pauses — heart rate keeps sampling straight through a
/// rest, matching how a continuous strength-training session should read in
/// Health.
final class WorkoutSessionManager: NSObject, ObservableObject {
    @Published private(set) var heartRate: Double?
    @Published private(set) var activeEnergy: Double?
    @Published private(set) var isSessionActive: Bool = false
    @Published var authorizationError: String?

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    private var shareTypes: Set<HKSampleType> {
        var types: Set<HKSampleType> = [HKObjectType.workoutType()]
        if let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) {
            types.insert(heartRateType)
        }
        if let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
            types.insert(energyType)
        }
        return types
    }

    private var readTypes: Set<HKObjectType> {
        guard let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            return []
        }
        return [heartRateType]
    }

    /// Idempotent: starts a session only when one isn't already running, and
    /// ends only when one is — safe to call from both a cold-launch
    /// `.onAppear` and every subsequent mirrored-state `.onChange`.
    func syncToActiveState(_ isActive: Bool) {
        if isActive {
            guard !isSessionActive else { return }
            requestAuthorizationAndStart()
        } else {
            guard isSessionActive else { return }
            endSession()
        }
    }

    private func requestAuthorizationAndStart() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        // isSessionActive flips true immediately so a second command-driven
        // `syncToActiveState(true)` firing before the authorization sheet
        // resolves can't start a duplicate session.
        isSessionActive = true
        healthStore.requestAuthorization(toShare: shareTypes, read: readTypes) { [weak self] granted, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let error {
                    self.authorizationError = error.localizedDescription
                    self.isSessionActive = false
                    return
                }
                self.beginSession()
            }
        }
    }

    private func beginSession() {
        let configuration = HKWorkoutConfiguration()
        // Sparky doesn't yet mirror per-exercise modality (weights vs. cardio)
        // to the watch, so every session is tagged the same way. Traditional
        // strength training is the closer default for a Hevy-style set/rep
        // flow than .other; revisit if/when modality joins the mirrored state.
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor

        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
            session.delegate = self
            builder.delegate = self

            self.session = session
            self.builder = builder

            let startDate = Date()
            session.startActivity(with: startDate)
            builder.beginCollection(withStart: startDate) { [weak self] _, error in
                if let error {
                    DispatchQueue.main.async {
                        self?.authorizationError = error.localizedDescription
                    }
                }
            }
        } catch {
            authorizationError = error.localizedDescription
            isSessionActive = false
        }
    }

    private func endSession() {
        guard let session else {
            isSessionActive = false
            return
        }
        // Finalizing (endCollection + finishWorkout, which actually saves the
        // HKWorkout) happens in the delegate once the session reports .ended,
        // matching HealthKit's documented state-machine flow.
        session.end()
    }

    private func finishBuilderAndReset() {
        guard let builder else {
            resetState()
            return
        }
        builder.endCollection(withEnd: Date()) { [weak self] _, _ in
            builder.finishWorkout { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.authorizationError = error.localizedDescription
                    }
                    self?.resetState()
                }
            }
        }
    }

    private func resetState() {
        session = nil
        builder = nil
        heartRate = nil
        activeEnergy = nil
        isSessionActive = false
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutSessionManager: HKWorkoutSessionDelegate {
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended else { return }
        DispatchQueue.main.async { [weak self] in
            self?.finishBuilderAndReset()
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.authorizationError = error.localizedDescription
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutSessionManager: HKLiveWorkoutBuilderDelegate {
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let quantityType = type as? HKQuantityType else { continue }
            let statistics = workoutBuilder.statistics(for: quantityType)
            updatePublishedValue(for: quantityType, statistics: statistics)
        }
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // No custom workout events emitted.
    }

    private func updatePublishedValue(for quantityType: HKQuantityType, statistics: HKStatistics?) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if quantityType == HKObjectType.quantityType(forIdentifier: .heartRate) {
                let unit = HKUnit.count().unitDivided(by: .minute())
                self.heartRate = statistics?.mostRecentQuantity()?.doubleValue(for: unit)
            } else if quantityType == HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
                self.activeEnergy = statistics?.sumQuantity()?.doubleValue(for: .kilocalorie())
            }
        }
    }
}
