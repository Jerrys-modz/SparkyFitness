import Foundation

// Getting back to a followed route after leaving it: where to rejoin, how far
// and which way. Pure Swift on top of `WatchRouteTracker`'s geometry, tested
// off the watch (see `watch-tests/`).

struct WatchRouteRejoin: Equatable {
    /// Where on the line to head for.
    let point: WatchRoutePoint
    /// Metres along the route from its start to `point`.
    let along: Double
    /// Metres in a straight line from the wearer to `point`.
    let distanceMeters: Double
    /// Degrees clockwise from north, from the wearer to `point`.
    let bearing: Double

    /// Which side of the wearer's direction of travel the point is on.
    enum Side: Equatable {
        case ahead, right, behind, left
    }

    /// A candidate that is preferred (the part of the route within reach of the
    /// wearer's progress, or the part still ahead over one already passed) is
    /// used unless another is nearer by more than this, so GPS noise cannot
    /// flip the arrow back and forth.
    static let hysteresisMeters: Double = 30
    /// How far past the wearer's progress the first choice looks.
    static let lookAheadMeters: Double = 500
    /// A point this far behind the wearer's progress counts as already passed.
    static let passedMeters: Double = 15

    /// Where to rejoin from `here`, given how far along the route the wearer
    /// last was (`progressMeters`). The point is the nearest on the part of the
    /// route still ahead of that progress, so a wearer is not sent back to
    /// something they already ran, and one who cut a corner is sent to where
    /// the line comes back near them. A point already passed is used only when
    /// it is nearer than the best one ahead by `hysteresisMeters`.
    ///
    /// The search looks `lookAheadMeters` past the progress first and only
    /// goes further along when that is more than `hysteresisMeters` worse than
    /// the nearest anywhere ahead. That matters on a loop whose start and
    /// finish are close together: a wearer who has not run it yet is pointed at
    /// the start, not teleported to the finish, and one nearly done is pointed
    /// at the finish.
    static func plan(
        from here: WatchRoutePoint,
        route: WatchRoute,
        cumulative: [Double],
        progressMeters: Double
    ) -> WatchRouteRejoin? {
        let points = route.points
        guard points.count >= 2, cumulative.count == points.count else { return nil }

        var aheadCandidates: [Candidate] = []
        var windowCandidates: [Candidate] = []
        var behindCandidates: [Candidate] = []
        for i in 0..<(points.count - 1) {
            let a = points[i]
            let b = points[i + 1]
            let projected = WatchRouteTracker.project(here, onto: a, b)
            let length = cumulative[i + 1] - cumulative[i]
            let candidate = Candidate(
                distance: projected.distance,
                along: cumulative[i] + projected.t * length,
                point: WatchRoutePoint(lat: a.lat + projected.t * (b.lat - a.lat), lon: a.lon + projected.t * (b.lon - a.lon))
            )
            if candidate.along >= progressMeters - passedMeters {
                aheadCandidates.append(candidate)
                if candidate.along <= progressMeters + lookAheadMeters { windowCandidates.append(candidate) }
            } else {
                behindCandidates.append(candidate)
            }
        }
        var ahead = nearest(aheadCandidates)
        if let windowed = nearest(windowCandidates), let anywhere = ahead,
           windowed.distance <= anywhere.distance + hysteresisMeters {
            ahead = windowed
        }
        let behind = nearest(behindCandidates)

        let chosen: Candidate
        switch (ahead, behind) {
        case let (ahead?, behind?):
            chosen = behind.distance + hysteresisMeters < ahead.distance ? behind : ahead
        case let (ahead?, nil):
            chosen = ahead
        case let (nil, behind?):
            chosen = behind
        case (nil, nil):
            return nil
        }
        return WatchRouteRejoin(
            point: chosen.point,
            along: chosen.along,
            distanceMeters: WatchRouteTracker.haversine(here, chosen.point),
            bearing: WatchRouteCamera.bearing(from: here, to: chosen.point)
        )
    }

    private struct Candidate {
        let distance: Double
        let along: Double
        let point: WatchRoutePoint
    }

    private static func nearest(_ candidates: [Candidate]) -> Candidate? {
        candidates.min { $0.distance < $1.distance }
    }

    // MARK: - Direction

    /// Degrees clockwise to turn an upward-pointing arrow so it points at the
    /// rejoin point, on a screen whose top is `heading` (the wearer's course;
    /// 0, north up, with none yet).
    func arrowRotation(heading: Double?) -> Double {
        let turned = (bearing - (heading ?? 0)).truncatingRemainder(dividingBy: 360)
        return turned < 0 ? turned + 360 : turned
    }

    /// Which side the point is on for a wearer heading `course`; nil without a
    /// course (standing still, no direction to be left or right of).
    func side(course: Double?) -> Side? {
        guard let course else { return nil }
        var delta = (bearing - course).truncatingRemainder(dividingBy: 360)
        if delta > 180 { delta -= 360 }
        if delta <= -180 { delta += 360 }
        switch abs(delta) {
        case ...45: return .ahead
        case ...135: return delta > 0 ? .right : .left
        default: return .behind
        }
    }
}
