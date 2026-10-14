import Foundation
import HealthKit

/// Where a wrist-only recording happens. Indoors there is no route and the
/// distance is the watch's own estimate from its motion sensors; outdoors the
/// watch's GPS records a route and measures the distance.
enum WatchRunPlace: String {
    case indoor, outdoor

    var locationType: HKWorkoutSessionLocationType {
        switch self {
        case .indoor: return .indoor
        case .outdoor: return .outdoor
        }
    }

    var label: String {
        switch self {
        case .indoor: return String(localized: "watch.run.place.indoor", defaultValue: "Indoor")
        case .outdoor: return String(localized: "watch.run.place.outdoor", defaultValue: "Outdoor")
        }
    }
}

/// How good the GPS is right now, from the latest fix's accuracy radius, shown
/// as signal bars on an outdoor recording. A fix older than `staleAfter` reads
/// as no signal, since the GPS has gone quiet.
enum GpsSignal: Int {
    case none, weak, fair, good

    static let staleAfter: TimeInterval = 15

    /// `accuracy` is the radius in metres (negative when the fix has none).
    init(accuracy: Double?, at time: Date?, now: Date = Date()) {
        guard let accuracy, let time, accuracy >= 0,
              now.timeIntervalSince(time) <= GpsSignal.staleAfter else {
            self = .none
            return
        }
        switch accuracy {
        case ...10: self = .good
        case ...25: self = .fair
        default: self = .weak
        }
    }

    var label: String {
        switch self {
        case .none: return String(localized: "watch.run.gps.none", defaultValue: "No GPS signal")
        case .weak: return String(localized: "watch.run.gps.weak", defaultValue: "Weak GPS signal")
        case .fair: return String(localized: "watch.run.gps.fair", defaultValue: "Fair GPS signal")
        case .good: return String(localized: "watch.run.gps.good", defaultValue: "Good GPS signal")
        }
    }
}

/// What the wearer is recording from the wrist alone. Raw values are for
/// logging, not the wire.
enum WatchRunKind: String {
    case walk, run

    func title(_ place: WatchRunPlace) -> String {
        switch (self, place) {
        case (.walk, .indoor): return String(localized: "watch.run.title.indoorWalk", defaultValue: "Indoor walk")
        case (.walk, .outdoor): return String(localized: "watch.run.title.outdoorWalk", defaultValue: "Outdoor walk")
        case (.run, .indoor): return String(localized: "watch.run.title.indoorRun", defaultValue: "Indoor run")
        case (.run, .outdoor): return String(localized: "watch.run.title.outdoorRun", defaultValue: "Outdoor run")
        }
    }

    var symbol: String {
        switch self {
        case .walk: return "figure.walk"
        case .run: return "figure.run"
        }
    }

    var activityType: HKWorkoutActivityType {
        switch self {
        case .walk: return .walking
        case .run: return .running
        }
    }
}

/// The figures shown while a wrist-only recording runs, and kept for the
/// summary after it ends.
struct WatchRunMetrics: Equatable {
    var distanceMeters: Double = 0
    var activeEnergyKcal: Double = 0
    var heartRate: Double?

    /// Seconds per kilometer or mile over the whole recording so far, or nil
    /// until there is enough distance for it to mean anything (an indoor
    /// estimate starts at zero and creeps up).
    static func paceSeconds(elapsed: TimeInterval, distanceMeters: Double, usesMiles: Bool) -> Double? {
        let unitMeters = usesMiles ? 1609.344 : 1000.0
        guard distanceMeters >= 50, elapsed > 0 else { return nil }
        return elapsed / (distanceMeters / unitMeters)
    }

    static func distanceText(_ meters: Double, usesMiles: Bool) -> String {
        let unitMeters = usesMiles ? 1609.344 : 1000.0
        return String(format: "%.2f", meters / unitMeters)
    }

    static func paceText(_ pace: Double?) -> String {
        guard let pace, pace > 0, pace < 3600 else { return "--:--" }
        let total = Int(pace.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    /// The same figures with the distance multiplied by `factor`.
    func scaled(_ factor: Double) -> WatchRunMetrics {
        var copy = self
        copy.distanceMeters *= factor
        return copy
    }
}

/// How far off the watch's indoor distance has been, learned on the phone from
/// the treadmill distances the wearer entered, one factor for walks and one for
/// runs. The watch multiplies its own indoor estimate by it, so the live
/// distance gets closer each time. Kept between 0.5 and 2 so one bad entry
/// cannot make the next session absurd.
struct IndoorDistanceScale: Codable, Equatable {
    var walk: Double
    var run: Double

    func factor(for kind: WatchRunKind) -> Double {
        Self.clamp(kind == .walk ? walk : run)
    }

    static func clamp(_ value: Double) -> Double {
        guard value.isFinite, value > 0 else { return 1 }
        return min(2, max(0.5, value))
    }
}

/// The phone asked the watch to record a walk or run (the phone's Record
/// screen, with the watch as the source). `requestId` ties the live view the
/// phone shows to this run, and lets a redelivered copy be ignored.
struct WatchRunStartRequest: Equatable {
    let requestId: String
    let kind: WatchRunKind
    let place: WatchRunPlace
    let requestedAt: Date
    let plan: WatchRunPlan?
    /// The Record screen's switches. Nil from an older phone build, which
    /// leaves the run to the phone's saved preferences.
    var settings: WatchRunSettings? = nil
}

/// Auto-pause and voice cues for one run. Chosen at the start (from the
/// phone's request, or its saved preferences for a run begun on the wrist)
/// and changeable while it runs, on the wrist or from the phone.
struct WatchRunSettings: Codable, Equatable {
    var autoPause: Bool
    var voiceCues: Bool
    /// A pace range to stay inside; nil is no pace alert. Optional so a
    /// snapshot written before it existed still decodes.
    var paceBand: WatchPaceBand? = nil
    /// A heart-rate range to stay inside; nil is no heart-rate alert.
    var heartRateBand: WatchHeartRateBand? = nil
    /// The wearer turned the pace alert off, which also silences the ranges
    /// of a plan's own steps. Optional so an older snapshot still decodes.
    var paceStepsOff: Bool? = nil
    /// Likewise for the heart-rate alert.
    var heartRateStepsOff: Bool? = nil
}

/// The alerts chosen for one run when it is started on the wrist. Each alert
/// is off (nil) unless the wearer turned it on for this run; the phone only
/// supplies the range last used as a starting point.
struct WatchRunAlertSetup: Equatable {
    var pace: WatchPaceBand?
    var heartRate: WatchHeartRateBand?

    static let off = WatchRunAlertSetup(pace: nil, heartRate: nil)
}

/// A plan a wrist-only run can follow: a list of steps the phone has already
/// named in its language, each ending on time or, for a distance step, on the
/// distance recorded in it. A training-program workout carries the program id
/// and the index of the workout so the phone can tick it off.
struct WatchRunPlan: Codable, Equatable, Identifiable {
    struct Step: Codable, Equatable {
        let label: String
        /// The step's length; on a distance step only its expected time.
        let seconds: Double
        /// Pace range to hold in this step; nil is free. Optional so a plan
        /// kept in an older snapshot still decodes.
        var pace: WatchPaceBand? = nil
        /// Heart-rate range to hold in this step; nil is free.
        var heartRate: WatchHeartRateBand? = nil

        /// A distance step ends once this many metres are recorded in it.
        /// Optional so plans and snapshots from before distance steps decode.
        var meters: Double? = nil
        /// "mi" when the distance step was set in miles; metres otherwise.
        var unit: String? = nil

        var isDistance: Bool { (meters ?? 0) > 0 }
        var inMiles: Bool { unit == "mi" }
    }

    /// Where the current step began, on the builder's active clock and in
    /// recorded metres. `index` is `steps.count` once the plan is over. A
    /// distance step's end cannot be worked out from the clock alone, so the
    /// run keeps this (and its snapshot does) and moves it on with `advance`.
    struct Cursor: Codable, Equatable {
        var index: Int
        var startElapsed: Double
        var startMeters: Double

        static let start = Cursor(index: 0, startElapsed: 0, startMeters: 0)
    }

    let id: String
    let name: String
    let programId: String?
    let programIndex: Int?
    let steps: [Step]
    /// "walk" for a walking program, otherwise nil (a run).
    var activity: String? = nil

    var kind: WatchRunKind { activity == "walk" ? .walk : .run }

    /// Distance steps need GPS, so such a plan is only offered outdoors.
    var hasDistanceSteps: Bool { steps.contains { $0.isDistance } }

    /// Where the plan stands. `index` is `steps.count` once the plan is over
    /// (the cool-down is the last step, the run itself carries on).
    struct Position: Equatable {
        let index: Int
        let label: String
        /// Seconds left in a timed step; 0 on a distance step.
        let remaining: TimeInterval
        /// Metres left in a distance step; nil on a timed step.
        let remainingMeters: Double?
        /// Whether that distance step was set in miles, for showing what is left.
        var inMiles: Bool = false
        let next: String?
        let finished: Bool
    }

    /// Moves `cursor` past every step that has ended by `elapsed` active
    /// seconds and `meters` recorded. The same rule as `advanceIntervalCursor`
    /// on the phone (`shared/src/utils/runIntervals.ts`); keep them in step.
    func advance(_ cursor: Cursor, elapsed: TimeInterval, meters: Double) -> Cursor {
        var current = cursor
        while current.index < steps.count {
            let step = steps[current.index]
            if step.isDistance {
                let end = current.startMeters + (step.meters ?? 0)
                guard meters >= end else { break }
                current = Cursor(index: current.index + 1, startElapsed: elapsed, startMeters: end)
            } else {
                let end = current.startElapsed + step.seconds
                guard elapsed >= end else { break }
                current = Cursor(index: current.index + 1, startElapsed: end, startMeters: meters)
            }
        }
        return current
    }

    func position(cursor: Cursor, elapsed: TimeInterval, meters: Double) -> Position? {
        guard !steps.isEmpty else { return nil }
        guard cursor.index < steps.count else {
            return Position(
                index: steps.count, label: String(localized: "watch.run.planComplete", defaultValue: "Plan complete"), remaining: 0,
                remainingMeters: nil, next: nil, finished: true
            )
        }
        let step = steps[cursor.index]
        let next = cursor.index + 1 < steps.count ? steps[cursor.index + 1] : nil
        let remainingMeters = step.isDistance
            ? max(0, cursor.startMeters + (step.meters ?? 0) - meters)
            : nil
        return Position(
            index: cursor.index,
            label: step.label,
            remaining: step.isDistance ? 0 : max(0, cursor.startElapsed + step.seconds - elapsed),
            remainingMeters: remainingMeters,
            inMiles: step.inMiles,
            next: next.map { "\($0.label) \(Self.length($0))" },
            finished: false
        )
    }

    /// Whether the last step has begun: the rule the phone uses to tick off a program workout.
    func lastStepStarted(cursor: Cursor) -> Bool {
        !steps.isEmpty && cursor.index >= steps.count - 1
    }

    static func clock(_ seconds: Double) -> String {
        let total = Int(seconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    /// A step distance in the unit it was set in: "400 m", "1.5 km" from a
    /// kilometre up, or "0.25 mi". The same rule as `stepDistanceText` on the phone.
    static func distance(_ value: Double, inMiles: Bool = false) -> String {
        if inMiles {
            let miles = (value / 1609.344 * 100).rounded() / 100
            return "\(trimmed(miles, digits: 2)) mi"
        }
        return value >= 1000
            ? "\(trimmed((value / 100).rounded() / 10, digits: 1)) km"
            : "\(Int(value.rounded())) m"
    }

    /// "1", "1.5", "0.25": no trailing zeros.
    static func trimmed(_ value: Double, digits: Int) -> String {
        var text = String(format: "%.\(digits)f", value)
        while text.contains("."), text.hasSuffix("0") { text.removeLast() }
        if text.hasSuffix(".") { text.removeLast() }
        return text
    }

    /// A step's length as shown: its distance, or its time as m:ss.
    static func length(_ step: Step) -> String {
        step.isDistance ? distance(step.meters ?? 0, inMiles: step.inMiles) : clock(step.seconds)
    }
}

/// Stands in for "no altitude" in a route row: a property list cannot carry nil.
/// The phone reads the same literal (`WATCH_NO_ALTITUDE` in `src/utils/watchRun.ts`).
let watchRunNoAltitude: Double = -9999

/// A finished wrist-only recording, as sent to the phone to file in the diary.
/// Rows are packed number arrays because the connection carries property
/// lists and an hour's route is thousands of fixes.
struct WatchRunResult {
    /// Also stamped on the Apple Health workout, which is what makes the
    /// phone's Health import skip it.
    let clientId: String
    let kind: WatchRunKind
    let place: WatchRunPlace
    let startedAt: Date
    let endedAt: Date
    let activeSeconds: TimeInterval
    var metrics: WatchRunMetrics
    /// `[t (epoch ms), lat, lon, alt, hacc, seg]`
    let route: [[Double]]
    /// `[t (epoch ms), bpm]`
    let heartRate: [[Double]]
    /// Epoch ms of each Lap press. The phone cuts the route at these.
    var laps: [Double] = []
    /// The distance covered (metres, cumulative) at each lap mark, same order.
    /// Indoors there is no route to measure laps from, so the phone uses these.
    var lapDistances: [Double] = []
    /// `[active seconds, cumulative metres]` every ~10 s while going, for the
    /// phone's pace chart. Empty after a relaunch mid-run.
    var distanceSeries: [[Double]] = []
    /// The plan followed, if any; `planCompleted` is whether its last step began.
    var plan: WatchRunPlan?
    var planCompleted = false
    /// The indoor factor applied to the watch's own distance (1 outdoors).
    var distanceScale: Double = 1
    /// What the watch showed before the wearer entered the treadmill's
    /// distance; nil when nothing was entered. The phone learns from the pair.
    var estimatedDistanceMeters: Double?

    /// The run with its distance (and the lap marks along it) multiplied by
    /// `factor`.
    func scalingDistance(by factor: Double) -> WatchRunResult {
        var copy = self
        copy.metrics = metrics.scaled(factor)
        copy.lapDistances = lapDistances.map { $0 * factor }
        copy.distanceSeries = distanceSeries.map { row in
            row.count == 2 ? [row[0], row[1] * factor] : row
        }
        return copy
    }

    /// Keeps at most `limit` rows, evenly spread and always including the
    /// last, so a long run stays inside the connection's size limit.
    static func thin(_ rows: [[Double]], to limit: Int) -> [[Double]] {
        guard rows.count > limit, limit > 1 else { return rows }
        let stride = Double(rows.count - 1) / Double(limit - 1)
        return (0..<limit).map { rows[Int((Double($0) * stride).rounded())] }
    }
}
