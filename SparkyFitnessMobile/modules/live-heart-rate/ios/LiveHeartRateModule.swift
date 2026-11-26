import ExpoModulesCore
import HealthKit

// Heart rate from headphones with a sensor (AirPods Pro 3) reaches an app only
// through a running workout session. iOS 26 lets an iPhone run one, so while a
// workout is live the phone opens a session, listens to the live builder and
// sends each new reading to JS. The workout itself is thrown away on stop: the
// app writes its own workouts to Health, and keeping this one would add a
// second copy. Older toolchains compile this with `isAvailable` false.
//
// Two things keep it working across the phone's life: every reading is also
// kept natively until JS asks for it (`drain`), because the phone usually
// locks between sets and JS may not run then; and `recover` adopts a session
// iOS kept alive when the app was killed mid-workout (Apple's crash recovery),
// which needs its live data source and delegates set up again.
public class LiveHeartRateModule: Module {
    #if compiler(>=6.2)
    private var controller: AnyObject?
    // A start is awaiting HealthKit. Only one may be in flight, and a stop that
    // arrives meanwhile is remembered, so a session can never be left running
    // that nothing holds a reference to. The three fields are only touched
    // through `withState`: the async functions below run off the main queue and
    // HealthKit calls back on its own.
    private var starting = false
    private var stopRequested = false
    private let stateLock = NSLock()

    private func withState<T>(_ body: () -> T) -> T {
        stateLock.lock()
        defer { stateLock.unlock() }
        return body()
    }

    private enum StartOutcome {
        case failed
        case stopped
        case running
    }
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
                let claimed = self.withState { () -> Bool in
                    if self.controller != nil || self.starting { return false }
                    self.starting = true
                    self.stopRequested = false
                    return true
                }
                if !claimed { return false }
                let controller = self.makeController()
                let started = await controller.start()
                let outcome = self.withState { () -> StartOutcome in
                    self.starting = false
                    if !started { return .failed }
                    if self.stopRequested { return .stopped }
                    self.controller = controller
                    return .running
                }
                switch outcome {
                case .failed:
                    return false
                case .stopped:
                    // Stopped while HealthKit was still starting: end it now.
                    await controller.stop()
                    return false
                case .running:
                    return true
                }
            }
            #endif
            return false
        }

        // Adopts the session iOS kept running when the app was killed during a
        // workout. True when one was taken over (or one is already running);
        // false when there was nothing to recover.
        AsyncFunction("recover") { () -> Bool in
            #if compiler(>=6.2)
            if #available(iOS 26.0, *) {
                // 0 = already running, 1 = claimed, 2 = a start is in flight.
                let claim = self.withState { () -> Int in
                    if self.controller != nil { return 0 }
                    if self.starting { return 2 }
                    self.starting = true
                    return 1
                }
                if claim == 0 { return true }
                if claim == 2 { return false }
                let controller = self.makeController()
                let recovered = await controller.recover()
                return self.withState { () -> Bool in
                    self.starting = false
                    if !recovered { return false }
                    self.controller = controller
                    return true
                }
            }
            #endif
            return false
        }

        // Readings collected since the last call, oldest first. The phone
        // usually locks between sets, so JS may have missed some live events.
        Function("drain") { () -> [[String: Double]] in
            #if compiler(>=6.2)
            if #available(iOS 26.0, *) {
                let current = self.withState { () -> AnyObject? in self.controller }
                return (current as? LiveHeartRateController)?.drain() ?? []
            }
            #endif
            return []
        }

        AsyncFunction("stop") { () -> Void in
            #if compiler(>=6.2)
            if #available(iOS 26.0, *) {
                // A start still waiting on HealthKit ends itself once it lands.
                let running = self.withState { () -> AnyObject? in
                    if self.starting { self.stopRequested = true }
                    let current = self.controller
                    self.controller = nil
                    return current
                }
                await (running as? LiveHeartRateController)?.stop()
            }
            #endif
        }

        OnDestroy {
            #if compiler(>=6.2)
            let current = self.withState { () -> AnyObject? in
                let current = self.controller
                self.controller = nil
                return current
            }
            if #available(iOS 26.0, *) {
                (current as? LiveHeartRateController)?.abandon()
            }
            #endif
        }
    }

    #if compiler(>=6.2)
    @available(iOS 26.0, *)
    private func makeController() -> LiveHeartRateController {
        return LiveHeartRateController(
            onReading: { [weak self] bpm, at in
                self?.sendEvent("onHeartRate", ["bpm": bpm, "at": at])
            },
            onStopped: { [weak self] in
                guard let self else { return }
                self.withState { self.controller = nil }
                self.sendEvent("onStopped", [:])
            }
        )
    }
    #endif
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
    // Readings kept until JS drains them. Guarded by `lock`: the builder calls
    // back on its own queue while JS drains from another.
    private let lock = NSLock()
    private var buffered: [[String: Double]] = []
    private let maxBuffered = 5_000

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

    // Takes over a session iOS kept alive after the app was killed. The builder
    // comes back in its earlier state but without a data source, so one is made
    // again from the session's own configuration, and the delegates are reset.
    func recover() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        let recovered: HKWorkoutSession? = await withCheckedContinuation { continuation in
            store.recoverActiveWorkoutSession { session, _ in
                continuation.resume(returning: session)
            }
        }
        guard let recovered else { return false }
        let builder = recovered.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(
            healthStore: store,
            workoutConfiguration: recovered.workoutConfiguration
        )
        recovered.delegate = self
        builder.delegate = self
        self.session = recovered
        self.builder = builder
        return true
    }

    func drain() -> [[String: Double]] {
        lock.lock()
        defer { lock.unlock() }
        let out = buffered
        buffered = []
        return out
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
        lock.lock()
        buffered.append(["bpm": bpm, "at": at])
        if buffered.count > maxBuffered {
            buffered.removeFirst(buffered.count - maxBuffered)
        }
        lock.unlock()
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
