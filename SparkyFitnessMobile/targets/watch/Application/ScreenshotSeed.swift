#if DEBUG
import Foundation

/// Fills the stores with `SampleDay` data at launch so a simulator with no
/// paired phone can still render populated pages for screenshots.
///
/// Driven by launch environment variables rather than a deep link: `simctl
/// openurl` is unreliable against a watchOS simulator, while `simctl launch`
/// passes environment straight through via `SIMCTL_CHILD_*`. It also keeps
/// `WatchDeepLink` alone, which would otherwise need a fourth copy of its
/// scheme string kept in sync.
///
/// `#if DEBUG` so none of this reaches a release build. The CI job in
/// `.github/workflows/ios-build.yml` is the only caller.
enum ScreenshotSeed {

    /// Which workout state to render.
    enum WorkoutState: String {
        /// Mid-workout with a live heart rate.
        case active
        /// A set just logged, so the rest countdown is on screen.
        case resting
        /// A countdown hold beside a weight box.
        case timed
        /// A hold with no planned length: the stopwatch.
        case stopwatch
        /// An AMRAP, so the interval caption shows.
        case interval
        /// Nothing armed — what the tab shows until the phone starts a workout.
        case none
    }

    static var isEnabled: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SEED"] == "1"
    }

    /// Page to land on, as a `ContentView.Page` raw name. Nil leaves the
    /// normal landing logic alone.
    static var requestedPage: String? {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_PAGE"]
    }

    /// Opens the exercise picker on appear. A sheet cannot be driven from
    /// `simctl` the way a launch environment can, so the view checks this.
    static var opensExerciseList: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "exercises"
    }

    /// Which scroll page of the active workout to land on: setoptions,
    /// exerciseoptions or actions.
    static var workoutPage: String? {
        let v = ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"]
        return ["setoptions", "exerciseoptions", "actions"].contains(v) ? v : nil
    }

    /// Opens the effort screen for the current set on appear.
    static var opensRpe: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "rpe"
    }

    /// Opens the "Update Workout?" question on appear.
    static var opensPresetUpdate: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "updatealert"
    }

    /// Which followed-run scene to render, set through the same
    /// `SPARKY_SCREENSHOT_SHEET` variable: `routelive` (the run page with the
    /// next turn), `routemap` (the route page) or `routeoff` (the off-route
    /// warning). Nil leaves the workout seed alone.
    private static var routeScenario: String? {
        let v = ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"]
        return ["routelive", "routemap", "routeoff"].contains(v) ? v : nil
    }

    /// Lands the followed run on its route page instead of the main page.
    static var opensRouteMap: Bool { routeScenario == "routemap" }

    private static var workoutState: WorkoutState {
        WorkoutState(
            rawValue: ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_WORKOUT"] ?? ""
        ) ?? .none
    }

    /// Seeds both stores. Safe to call once, from `ContentView.onAppear`.
    ///
    /// The check-in context matters even for a workout screenshot: without a
    /// seed weight `needsFirstRunEntry` is true and `ContentView` shows the
    /// first-run gate instead of the tabs, so every screenshot would be of
    /// that one screen.
    @MainActor
    static func apply() {
        CheckInStore.shared.apply(context: SampleDay.context)

        let workout = WorkoutSessionStore.shared
        if let scenario = routeScenario {
            workout.reset()
            applyRouteRun(scenario)
            return
        }
        switch workoutState {
        case .none:
            workout.reset()
        case .timed, .stopwatch, .interval:
            switch workoutState {
            case .timed: workout.start(with: SampleDay.timedPlan)
            case .stopwatch: workout.start(with: SampleDay.stopwatchPlan)
            default: workout.start(with: SampleDay.intervalPlan)
            }
            workout.recordHeartRate(bpm: SampleDay.workoutBpm)
            workout.recordActiveEnergy(kcal: SampleDay.workoutKcal)
        case .active, .resting:
            workout.start(with: SampleDay.workoutPlan)
            workout.recordHeartRate(bpm: SampleDay.workoutBpm)
            workout.recordActiveEnergy(kcal: SampleDay.workoutKcal)
            if workoutState == .resting {
                // Completing a set is what starts its rest, so this is also
                // how the rest screen gets on screen.
                workout.completeCurrentSet()
            }
        }
    }

    // MARK: - Followed run

    /// A short loop in a park: out east, then a zig-zag north and back.
    private static let sampleRoute = WatchRoute(
        id: "sample-route",
        name: "Park loop",
        points: [
            WatchRoutePoint(lat: 40.7700, lon: -73.9800),
            WatchRoutePoint(lat: 40.7700, lon: -73.9760),
            WatchRoutePoint(lat: 40.7730, lon: -73.9760),
            WatchRoutePoint(lat: 40.7730, lon: -73.9720),
            WatchRoutePoint(lat: 40.7760, lon: -73.9720),
            WatchRoutePoint(lat: 40.7760, lon: -73.9760),
            WatchRoutePoint(lat: 40.7790, lon: -73.9760),
            WatchRoutePoint(lat: 40.7790, lon: -73.9800),
            WatchRoutePoint(lat: 40.7730, lon: -73.9800),
            WatchRoutePoint(lat: 40.7700, lon: -73.9800),
        ],
        cues: [
            WatchRouteCue(index: 0, kind: .depart, text: nil),
            WatchRouteCue(index: 1, kind: .left, text: nil),
            WatchRouteCue(index: 2, kind: .right, text: nil),
            WatchRouteCue(index: 3, kind: .left, text: nil),
            WatchRouteCue(index: 4, kind: .left, text: nil),
            WatchRouteCue(index: 5, kind: .right, text: nil),
            WatchRouteCue(index: 6, kind: .left, text: nil),
            WatchRouteCue(index: 7, kind: .left, text: nil),
            WatchRouteCue(index: 9, kind: .arrive, text: nil),
        ]
    )

    /// GPS fixes about 30 m apart along straight lines through `waypoints`.
    private static func fixes(through waypoints: [WatchRoutePoint]) -> [WatchRoutePoint] {
        guard var previous = waypoints.first else { return [] }
        var out = [previous]
        for next in waypoints.dropFirst() {
            let dLat = next.lat - previous.lat
            let dLon = next.lon - previous.lon
            let steps = max(1, Int((max(abs(dLat), abs(dLon)) / 0.0003).rounded(.up)))
            for i in 1...steps {
                let f = Double(i) / Double(steps)
                out.append(WatchRoutePoint(lat: previous.lat + dLat * f, lon: previous.lon + dLon * f))
            }
            previous = next
        }
        return out
    }

    @MainActor
    private static func applyRouteRun(_ scenario: String) {
        let p = sampleRoute.points
        var walked: [WatchRoutePoint]
        switch scenario {
        case "routemap":
            // Well round the loop, so the covered part is greyed out.
            walked = fixes(through: [p[0], p[1], p[2], p[3], p[4], WatchRoutePoint(lat: 40.7760, lon: -73.9740)])
        case "routeoff":
            // A few seconds of fixes ~70 m off the line.
            walked = fixes(through: [p[0], WatchRoutePoint(lat: 40.7700, lon: -73.9775)])
            let off = WatchRoutePoint(lat: 40.7710, lon: -73.9768)
            walked.append(contentsOf: Array(repeating: off, count: 5))
        default:
            // Just short of the second turn.
            walked = fixes(through: [p[0], p[1], WatchRoutePoint(lat: 40.77264, lon: -73.9760)])
        }
        WatchRunStore.shared.seedRouteRun(
            route: sampleRoute,
            fixes: walked,
            metrics: WatchRunMetrics(distanceMeters: 1480, activeEnergyKcal: 96, heartRate: 148)
        )
    }
}
#endif
