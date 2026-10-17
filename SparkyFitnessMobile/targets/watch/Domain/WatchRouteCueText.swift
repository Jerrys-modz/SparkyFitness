import Foundation

/// How a route cue reads on the wrist and aloud. The words are the watch's own
/// (translated); a route that carries its own `text` ("Turn left onto Mill
/// Lane") wins over them.
extension WatchRouteCueKind {
    var symbol: String {
        switch self {
        case .depart, .straight: return "arrow.up"
        case .slightLeft: return "arrow.up.left"
        case .left: return "arrow.turn.up.left"
        case .sharpLeft: return "arrow.turn.down.left"
        case .slightRight: return "arrow.up.right"
        case .right: return "arrow.turn.up.right"
        case .sharpRight: return "arrow.turn.down.right"
        case .uturn: return "arrow.uturn.down"
        case .arrive: return "flag.checkered"
        }
    }

    var title: String {
        switch self {
        case .depart: return String(localized: "watch.route.cue.depart", defaultValue: "Start")
        case .straight: return String(localized: "watch.route.cue.straight", defaultValue: "Continue straight")
        case .slightLeft: return String(localized: "watch.route.cue.slightLeft", defaultValue: "Bear left")
        case .left: return String(localized: "watch.route.cue.left", defaultValue: "Turn left")
        case .sharpLeft: return String(localized: "watch.route.cue.sharpLeft", defaultValue: "Sharp left")
        case .slightRight: return String(localized: "watch.route.cue.slightRight", defaultValue: "Bear right")
        case .right: return String(localized: "watch.route.cue.right", defaultValue: "Turn right")
        case .sharpRight: return String(localized: "watch.route.cue.sharpRight", defaultValue: "Sharp right")
        case .uturn: return String(localized: "watch.route.cue.uturn", defaultValue: "Make a U-turn")
        case .arrive: return String(localized: "watch.route.cue.arrive", defaultValue: "Finish")
        }
    }
}

extension WatchRouteCue {
    /// "Turn left", or the route's own wording.
    var instruction: String { text ?? kind.title }

    /// "In 50 m, turn left" for the voice coach.
    func spoken(distanceMeters: Double, inMiles: Bool) -> String {
        let distance = WatchRunPlan.distance(max(10, (distanceMeters / 10).rounded() * 10), inMiles: inMiles)
        return String(localized: "watch.route.spoken", defaultValue: "In \(distance), \(instruction)")
    }
}

extension WatchRouteRejoin {
    /// "80 m", rounded to the nearest 10 below a kilometre, in the phone's unit.
    func distanceText(usesMiles: Bool) -> String {
        WatchRunPlan.distance(max(10, (distanceMeters / 10).rounded() * 10), inMiles: usesMiles)
    }

    /// "Back on route in 80 m", for the cue strip and the route page.
    func instruction(usesMiles: Bool) -> String {
        String(localized: "watch.route.rejoin", defaultValue: "Back on route in \(distanceText(usesMiles: usesMiles))")
    }

    /// "Off route. Rejoin in 80 m, to your left" for the voice coach. Without a
    /// course there is no left or right to give, so the distance stands alone.
    func spoken(course: Double?, usesMiles: Bool) -> String {
        let distance = distanceText(usesMiles: usesMiles)
        switch side(course: course) {
        case .ahead?:
            return String(localized: "watch.route.rejoinSpokenAhead", defaultValue: "Off route. Rejoin in \(distance), straight ahead")
        case .left?:
            return String(localized: "watch.route.rejoinSpokenLeft", defaultValue: "Off route. Rejoin in \(distance), to your left")
        case .right?:
            return String(localized: "watch.route.rejoinSpokenRight", defaultValue: "Off route. Rejoin in \(distance), to your right")
        case .behind?:
            return String(localized: "watch.route.rejoinSpokenBehind", defaultValue: "Off route. Rejoin in \(distance), behind you")
        case nil:
            return String(localized: "watch.route.rejoinSpoken", defaultValue: "Off route. Rejoin in \(distance)")
        }
    }
}

extension WatchRouteRace {
    /// "Ahead 12 s", "Behind 8 s" or "Even with your best".
    var text: String {
        switch standing {
        case .ahead:
            return String(localized: "watch.route.race.ahead", defaultValue: "Ahead \(Self.clock(seconds))")
        case .behind:
            return String(localized: "watch.route.race.behind", defaultValue: "Behind \(Self.clock(seconds))")
        case .even:
            return String(localized: "watch.route.race.even", defaultValue: "Even with your best")
        }
    }

    /// Said when the wearer drops behind: "You are 8 seconds behind your best time."
    var behindSpoken: String {
        String(localized: "watch.route.race.behindSpoken", defaultValue: "You are \(seconds) seconds behind your best time.")
    }

    /// "12 s", or "1:05" from a minute up.
    static func clock(_ seconds: Int) -> String {
        seconds < 60 ? "\(seconds) s" : String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}
