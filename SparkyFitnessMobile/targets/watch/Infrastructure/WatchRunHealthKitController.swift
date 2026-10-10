import CoreLocation
import Foundation
import HealthKit

/// A walk or run recorded on the wrist alone, indoors or out.
///
/// A real `HKWorkoutSession`. Indoors (`locationType = .indoor`) the watch
/// estimates distance from its motion sensors; outdoors it uses its own GPS
/// for distance and records the route, which is attached to the workout when
/// it is saved. Heart rate is sampled at workout rate either way.
///
/// When the wearer finishes, the workout (and route) is written to Apple Health
/// and the same run is sent to the phone as a `runFinished` message (queued, so
/// an out-of-range phone gets it later), which files it in the diary as a
/// native SparkyFitness activity with its route and heart rate.
///
/// The Health workout is stamped with `SparkyFitnessSessionId` so the phone's
/// HealthKit import skips it: the message is the only route into the diary,
/// and importing the Health copy too would log the run twice.
///
/// watchOS runs one workout session at a time, so the store only starts this
/// when neither a strength workout nor a phone-GPS recording holds one.
///
/// A session left running when the app is killed is not re-attached by this
/// controller: it cannot tell whose session it would be recovering.
final class WatchRunHealthKitController: NSObject, CLLocationManagerDelegate {
    static let shared = WatchRunHealthKitController()

    /// Called on the main queue when new figures are available.
    var onMetrics: ((WatchRunMetrics) -> Void)?
    /// Called on the main queue when the session ends unexpectedly.
    var onFailure: (() -> Void)?
    /// Called on the main queue when the wearer stops or starts moving
    /// outdoors: `.pause` or `.resume`. Never called indoors, where there is
    /// no speed to judge by.
    var onAutoPause: ((WatchAutoPause.Action) -> Void)?

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var metrics = WatchRunMetrics()

    // Outdoor only.
    private var locationManager: CLLocationManager?
    private var routeBuilder: HKWorkoutRouteBuilder?
    /// Whether fixes are being added to the route right now: off while paused,
    /// so standing still at a light does not draw a stray tail.
    private var collectingRoute = false
    private var autoPause = WatchAutoPause()
    private var runKind: WatchRunKind = .run
    /// Whether the last pause was ours, so only that one is ever resumed.
    private var pausedByAutoPause = false

    /// Stamped on the Health workout so the phone's import skips it: the phone
    /// files the run itself from the message sent at the end. One literal here
    /// and one in `healthkit/dataTransformation.ts`; rename both or neither.
    private static let sessionMetadataKey = "SparkyFitnessSessionId"
    private var clientId = UUID().uuidString
    private var startedAt = Date()
    private var runPlace: WatchRunPlace = .indoor
    /// What goes to the phone: the accepted route and the heart-rate readings.
    private var routeRows: [[Double]] = []
    private var routeSegment = 0.0
    private var heartRateRows: [[Double]] = []

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
            HKSeriesType.workoutRoute(),
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
    func start(_ kind: WatchRunKind, place: WatchRunPlace) -> Bool {
        guard HKHealthStore.isHealthDataAvailable(), session == nil else { return false }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = kind.activityType
        configuration.locationType = place.locationType

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
            runKind = kind
            runPlace = place
            autoPause.reset()
            pausedByAutoPause = false
            clientId = UUID().uuidString
            routeRows = []
            routeSegment = 0
            heartRateRows = []

            let now = Date()
            startedAt = now
            newSession.startActivity(with: now)
            let marker = [Self.sessionMetadataKey: clientId]
            newBuilder.beginCollection(withStart: now) { _, _ in
                newBuilder.addMetadata(marker) { _, _ in }
            }
            if place == .outdoor { startRoute() }
            return true
        } catch {
            session = nil
            builder = nil
            return false
        }
    }

    /// `automatic` marks a pause the detector made, the only kind it resumes.
    func pause(automatic: Bool = false) {
        session?.pause()
        collectingRoute = false
        pausedByAutoPause = automatic
        autoPause.reset()
    }

    func resume() {
        session?.resume()
        collectingRoute = routeBuilder != nil
        pausedByAutoPause = false
        autoPause.reset()
        // The jump across a pause is never distance, so the phone is told
        // where a new stretch begins.
        routeSegment += 1
    }

    /// Ends the session and writes the workout to Apple Health (`save`) or
    /// throws it away. `completion` runs on the main queue with the final
    /// figures and the active time.
    func end(save: Bool, completion: @escaping (WatchRunMetrics, TimeInterval, WatchRunResult?) -> Void) {
        guard let session, let endingBuilder = builder else {
            completion(metrics, 0, nil)
            return
        }
        let finalElapsed = endingBuilder.elapsedTime
        let endingRoute = routeBuilder
        let endedAt = Date()
        let rows = (route: routeRows, heartRate: heartRateRows)
        stopRoute()
        self.session = nil
        self.builder = nil
        session.end()
        endingBuilder.endCollection(withEnd: endedAt) { [weak self] _, _ in
            if save {
                endingBuilder.finishWorkout { workout, _ in
                    // The route can only be attached to a saved workout.
                    if let workout, let endingRoute {
                        endingRoute.finishRoute(with: workout, metadata: nil) { _, _ in }
                    }
                }
            } else {
                endingBuilder.discardWorkout()
                endingRoute?.discard()
            }
            DispatchQueue.main.async {
                guard let self else {
                    completion(WatchRunMetrics(), finalElapsed, nil)
                    return
                }
                let result = save ? WatchRunResult(
                    clientId: self.clientId,
                    kind: self.runKind,
                    place: self.runPlace,
                    startedAt: self.startedAt,
                    endedAt: endedAt,
                    activeSeconds: finalElapsed,
                    metrics: self.metrics,
                    route: rows.route,
                    heartRate: rows.heartRate
                ) : nil
                completion(self.metrics, finalElapsed, result)
            }
        }
    }
}

// MARK: - Route (outdoor)

extension WatchRunHealthKitController {
    /// Starts the watch's GPS and a route builder. The location prompt shows
    /// the first time; fixes start arriving once it is allowed. A denied
    /// permission leaves a workout with no route, and the distance the
    /// session estimates without GPS.
    fileprivate func startRoute() {
        routeBuilder = HKWorkoutRouteBuilder(healthStore: healthStore, device: nil)
        let manager = CLLocationManager()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.activityType = .fitness
        locationManager = manager
        collectingRoute = true
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        default:
            break
        }
    }

    fileprivate func stopRoute() {
        locationManager?.stopUpdatingLocation()
        locationManager?.delegate = nil
        locationManager = nil
        collectingRoute = false
        routeBuilder = nil
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        judgeMovement(locations)
        guard collectingRoute, let routeBuilder else { return }
        // Apple's guidance: drop fixes with no usable accuracy, and ones too
        // coarse to draw a believable line.
        let usable = locations.filter { $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy <= 50 }
        guard !usable.isEmpty else { return }
        routeBuilder.insertRouteData(usable) { _, _ in }
        routeRows.append(contentsOf: usable.map { fix in
            [
                fix.timestamp.timeIntervalSince1970 * 1000,
                fix.coordinate.latitude,
                fix.coordinate.longitude,
                fix.verticalAccuracy >= 0 ? fix.altitude : watchRunNoAltitude,
                fix.horizontalAccuracy,
                routeSegment,
            ]
        })
    }

    /// Runs every fix, paused or not, through the auto-pause detector. The
    /// location manager keeps running while paused for exactly this reason.
    private func judgeMovement(_ locations: [CLLocation]) {
        guard session != nil else { return }
        for location in locations {
            let paused = pausedByAutoPause
            let action = autoPause.step(
                speed: location.speed,
                accuracy: location.horizontalAccuracy,
                at: location.timestamp,
                kind: runKind,
                paused: paused
            )
            guard action != .none else { continue }
            // A manual pause is never auto-resumed.
            if action == .resume && !paused { continue }
            DispatchQueue.main.async { [weak self] in self?.onAutoPause?(action) }
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
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
            self?.routeBuilder?.discard()
            self?.stopRoute()
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
        let reading = collectedTypes.contains(Self.heartRateType) ? updated.heartRate : nil
        let readAt = Date().timeIntervalSince1970 * 1000
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.metrics = updated
            if let reading, self.session != nil {
                self.heartRateRows.append([readAt, reading])
            }
            self.onMetrics?(updated)
        }
    }
}
