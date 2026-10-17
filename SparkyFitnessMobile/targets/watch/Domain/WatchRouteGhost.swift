import Foundation

// Racing the best run over a followed route. The phone sends the best run's
// elapsed active seconds at every 100 m of route progress (`ghost` on the
// route payload); this file turns that and the wearer's progress and clock
// into "Ahead 12 s" / "Behind 8 s". Pure Swift, nothing imported from the
// watch app, so it is tested off the watch (see `watch-tests/`).

enum WatchRouteGhost {
    /// Metres of route between two entries of the pace line. The phone's
    /// `ROUTE_GHOST_INTERVAL_M` is the other half; keep them in step.
    static let intervalMeters: Double = 100
    /// The most entries a pace line may have (a 100 km route).
    static let maxKnots = 1000
    /// Nearer the start than this there is nothing to compare yet.
    static let minProgressMeters: Double = 30

    /// A usable pace line from the wire numbers, or nil: empty, too long, not
    /// whole seconds, running backwards, or never moving. Mirrors
    /// `encodeWatchGhost` on the phone, so a malformed line is dropped here too.
    static func decode(_ raw: [Double]?) -> [Int]? {
        guard let raw, !raw.isEmpty, raw.count <= maxKnots else { return nil }
        var seconds: [Int] = []
        var previous = 0
        for value in raw {
            guard value.isFinite, value >= Double(previous), value == value.rounded(), value < 1_000_000 else { return nil }
            previous = Int(value)
            seconds.append(previous)
        }
        return previous > 0 ? seconds : nil
    }

    /// Seconds the best run had spent when it was `meters` along a route
    /// `totalMeters` long, interpolating between entries; the whole time at or
    /// past the end. The last entry sits at the end of the route, wherever that
    /// falls between multiples of 100 m.
    static func time(atMeters meters: Double, ghost: [Int], totalMeters: Double) -> Double {
        guard let last = ghost.last else { return 0 }
        if meters <= 0 { return 0 }
        if meters >= totalMeters { return Double(last) }
        // Entry i (1-based) is at i * interval, the last at the route's end.
        var fromDistance = 0.0
        var fromTime = 0.0
        for (offset, seconds) in ghost.enumerated() {
            let isLast = offset == ghost.count - 1
            let toDistance = isLast ? max(totalMeters, fromDistance) : Double(offset + 1) * intervalMeters
            let toTime = Double(seconds)
            if meters <= toDistance {
                let span = toDistance - fromDistance
                guard span > 0 else { return toTime }
                return fromTime + (toTime - fromTime) * (meters - fromDistance) / span
            }
            fromDistance = toDistance
            fromTime = toTime
        }
        return Double(last)
    }
}

/// How the wearer stands against the best run at this point of the route.
struct WatchRouteRace: Equatable {
    enum Standing: Equatable {
        case ahead, behind, even
    }

    /// Whole seconds, always positive or zero.
    let seconds: Int
    let standing: Standing

    /// Shorter than this a gap is called even ("Even" rather than "Ahead 0 s").
    static let evenWithinSeconds: Double = 1

    /// Nil with no pace line, before there is progress to compare, or when the
    /// wearer is not on the route (their progress is then stale). At the end of
    /// the route the comparison is against the best run's whole time, so the
    /// finish keeps showing the margin.
    static func compare(
        ghost: [Int]?,
        progressMeters: Double,
        totalMeters: Double,
        elapsedSeconds: Double,
        onRoute: Bool
    ) -> WatchRouteRace? {
        guard let ghost, !ghost.isEmpty, onRoute, totalMeters > 0, elapsedSeconds >= 0 else { return nil }
        guard progressMeters >= WatchRouteGhost.minProgressMeters else { return nil }
        let best = WatchRouteGhost.time(atMeters: progressMeters, ghost: ghost, totalMeters: totalMeters)
        let margin = best - elapsedSeconds
        if abs(margin) < evenWithinSeconds { return WatchRouteRace(seconds: 0, standing: .even) }
        return WatchRouteRace(seconds: Int(abs(margin).rounded()), standing: margin > 0 ? .ahead : .behind)
    }

    /// Minimum gap between two alerts about falling behind.
    static let alertCooldown: TimeInterval = 120

    /// Whether to buzz (and speak, with voice cues on) now: only on the change
    /// from ahead to behind, and not within `alertCooldown` of the last alert,
    /// so a wearer hovering around the line is not nagged.
    static func shouldAlert(
        previous: Standing?,
        current: Standing,
        lastAlertAt: Date?,
        now: Date
    ) -> Bool {
        guard previous == .ahead, current == .behind else { return false }
        guard let lastAlertAt else { return true }
        return now.timeIntervalSince(lastAlertAt) >= alertCooldown
    }
}
