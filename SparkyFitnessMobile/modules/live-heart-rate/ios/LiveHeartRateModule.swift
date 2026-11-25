import ExpoModulesCore
import HealthKit

// Heart rate from headphones with a sensor (AirPods Pro 3) reaches an app only
// through a running workout session. iOS 26 lets an iPhone run one, so while a
// workout is live the phone opens a session, listens to the live builder and
// sends each new reading to JS. The workout itself is thrown away on stop: the
// app writes its own workouts to Health, and keeping this one would add a
// second copy. Older toolchains compile this with `isAvailable` false.
public class LiveHeartRateModule: Module {
    #if compiler(>=6.2)
    private var controller: AnyObject?
    #endif

    public func definition() -> ModuleDefinition {
        Name("LiveHeartRate")

        Events("onHeartRate", "onStopped")

        Function("isAvailable") { () -> Bool in
            #if compiler(>=6.2)
            if #available(iOS 26.0, *) {
                return HKHealthStore.isHealthDataAvailable()
            }
            #endif
            return false
        }

        // True once the session is collecting. False when this OS cannot run
        // one, Health refused it, or one is already running.
        AsyncFunction("start") { () -> Bool in
            #if compiler(>=6.2)
            if #available(iOS 26.0, *) {
                if self.controller != nil { return false }
                let controller = LiveHeartRateController(
                    onReading: { [weak self] bpm, at in
                        self?.sendEvent("onHeartRate", ["bpm": bpm, "at": at])
                    },
                    onStopped: { [weak self] in
                        self?.controller = nil
                        self?.sendEvent("onStopped", [:])
                    }
                )
                guard await controller.start() else { return false }
                self.controller = controller
                return true
            }
            #endif
            return false
        }

        AsyncFunction("stop") { () -> Void in
            #if compiler(>=6.2)
            if #available(iOS 26.0, *) {
                let running = self.controller as? LiveHeartRateController
                self.controller = nil
                await running?.stop()
            }
            #endif
        }

        OnDestroy {
            #if compiler(>=6.2)
            if #available(iOS 26.0, *) {
                (self.controller as? LiveHeartRateController)?.abandon()
            }
            self.controller = nil
            #endif
        }
    }
}

#if compiler(>=6.2)
@available(iOS 26.0, *)
private final class LiveHeartRateController: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    private let store = HKHealthStore()
    private let onReading: (Double, Double) -> Void
    private let onStopped: () -> Void
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var lastEmitted: Double = 0

    init(onReading: @escaping (Double, Double) -> Void, onStopped: @escaping () -> Void) {
        self.onReading = onReading
        self.onStopped = onStopped
    }

    func start() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable(),
              let heartRate = HKQuantityType.quantityType(forIdentifier: .heartRate)
        else { return false }
        do {
            try await store.requestAuthorization(
                toShare: [HKObjectType.workoutType()],
                read: [heartRate]
            )
            let configuration = HKWorkoutConfiguration()
            configuration.activityType = .traditionalStrengthTraining
            configuration.locationType = .indoor
            let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(
                healthStore: store,
                workoutConfiguration: configuration
            )
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder
            let startDate = Date()
            session.startActivity(with: startDate)
            try await builder.beginCollection(at: startDate)
            return true
        } catch {
            session?.end()
            session = nil
            builder = nil
            return false
        }
    }

    func stop() async {
        guard let session, let builder else { return }
        self.session = nil
        self.builder = nil
        session.end()
        do {
            try await builder.endCollection(at: Date())
        } catch {}
        builder.discardWorkout()
    }

    // The module is being torn down: end without waiting.
    func abandon() {
        session?.end()
        builder?.discardWorkout()
        session = nil
        builder = nil
    }

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard let heartRate = HKQuantityType.quantityType(forIdentifier: .heartRate),
              collectedTypes.contains(heartRate),
              let statistics = workoutBuilder.statistics(for: heartRate),
              let quantity = statistics.mostRecentQuantity(),
              let interval = statistics.mostRecentQuantityDateInterval()
        else { return }
        let bpm = quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        let at = interval.end.timeIntervalSince1970 * 1000
        guard bpm > 0, at > lastEmitted else { return }
        lastEmitted = at
        onReading(bpm, at)
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        if toState == .ended || toState == .stopped, session != nil {
            // Ended from outside (Control Center, another app took over).
            session = nil
            builder?.discardWorkout()
            builder = nil
            onStopped()
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        session = nil
        builder?.discardWorkout()
        builder = nil
        onStopped()
    }
}
#endif
