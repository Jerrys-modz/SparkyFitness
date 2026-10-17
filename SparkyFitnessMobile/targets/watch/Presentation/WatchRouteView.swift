import SwiftUI
import MapKit

/// "Start is 600 m away", for a wearer who has not reached the route yet.
func startAwayText(_ approach: WatchRouteTracker.StartApproach, usesMiles: Bool) -> String {
    let distance = WatchRunPlan.distance(max(10, (approach.distanceMeters / 10).rounded() * 10), inMiles: usesMiles)
    return String(localized: "watch.route.startAway", defaultValue: "Start is \(distance) away")
}

/// What the wearer needs from a followed route at a glance, shown under the
/// clock on the run's main page: the next turn and how far, or a red warning
/// when they have left the route.
struct RouteCueStrip: View {
    let progress: WatchRouteTracker.Snapshot?
    let usesMiles: Bool
    /// Ahead / Behind the best run, when the route has one and the switch is on.
    var race: WatchRouteRace? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: WatchStyle.s(2)) {
            cueRow
            if let race {
                RaceLabel(race: race)
                    .font(.system(size: WatchStyle.s(12), weight: .bold))
            }
        }
        .padding(.horizontal, WatchStyle.s(8))
        .padding(.vertical, WatchStyle.s(4))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: WatchStyle.s(10), style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var cueRow: some View {
        HStack(spacing: WatchStyle.s(6)) {
            Image(systemName: symbol)
                .font(.system(size: WatchStyle.s(15), weight: .bold))
                .rotationEffect(.degrees(symbolRotation))
            Text(label)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 4)
            if let distance {
                Text(distance)
                    .monospacedDigit()
            }
        }
        .font(.system(size: WatchStyle.s(14), weight: .bold))
        .foregroundStyle(tint)
    }

    private var isOff: Bool { progress?.isOffRoute == true }

    /// Set while the wearer has not reached the route line yet.
    private var approach: WatchRouteTracker.StartApproach? { progress?.startApproach }

    /// The start arrow turns to point at the start, ahead being up when the
    /// wearer's direction of travel is known and north otherwise.
    private var symbolRotation: Double {
        if isOff, let rejoin = progress?.rejoin { return rejoin.arrowRotation(heading: progress?.course) }
        return approach.map { $0.arrowRotation(heading: $0.course) } ?? 0
    }

    private var tint: Color { isOff ? .red : .cyan }

    private var symbol: String {
        if approach != nil { return "location.north.fill" }
        if isOff { return progress?.rejoin != nil ? "location.north.fill" : "exclamationmark.triangle.fill" }
        guard let progress else { return "location.slash" }
        if progress.arrived { return WatchRouteCueKind.arrive.symbol }
        return progress.nextCue?.cue.kind.symbol ?? "arrow.up"
    }

    private var label: String {
        if let approach {
            return startAwayText(approach, usesMiles: usesMiles)
        }
        if isOff {
            // How to get back, not just that the wearer has left.
            if let rejoin = progress?.rejoin { return rejoin.instruction(usesMiles: usesMiles) }
            return String(localized: "watch.route.offRoute", defaultValue: "Off route")
        }
        guard let progress else { return String(localized: "watch.route.waitingGps", defaultValue: "Waiting for GPS") }
        if progress.arrived { return WatchRouteCueKind.arrive.title }
        return progress.nextCue?.cue.instruction ?? WatchRouteCueKind.straight.title
    }

    private var distance: String? {
        guard let progress, approach == nil, !isOff, !progress.arrived, let next = progress.nextCue else { return nil }
        return WatchRunPlan.distance(next.distanceMeters, inMiles: usesMiles)
    }
}

/// "Ahead 12 s" in green, "Behind 8 s" in orange.
struct RaceLabel: View {
    let race: WatchRouteRace

    var body: some View {
        Label {
            Text(race.text).monospacedDigit()
        } icon: {
            Image(systemName: race.standing == .behind ? "tortoise.fill" : "hare.fill")
        }
        .foregroundStyle(race.standing == .behind ? Color.orange : Color.green)
    }
}

/// The route page of a followed run: Apple Maps close around the wearer,
/// turned so the way ahead points up, with the route ahead in bold cyan and the
/// part already covered greyed out, a marker on the next turn, and the distance
/// left with the next instruction underneath. `WatchRouteOverviewPage` is the
/// whole route on one screen.
///
/// The map is a still picture (no panning or zooming, which would fight the
/// crown and the swipe between pages). With no signal the tiles stay blank, but
/// the route and the wearer are overlays MapKit draws itself, so the page is
/// still usable on a trail with no coverage.
struct WatchRouteMapPage: View {
    var mode: RouteMapMode = .follow

    @EnvironmentObject private var run: WatchRunStore
    @EnvironmentObject private var store: CheckInStore

    private var usesMiles: Bool { store.context.distanceUnit == "miles" }

    var body: some View {
        if let route = run.route {
            RouteMapLayer(
                route: route,
                progress: run.routeProgress,
                position: run.routePosition,
                mode: mode,
                rejoin: run.routeProgress?.rejoin,
                usesMiles: usesMiles
            )
            .overlay(alignment: .bottom) { footer }
            .overlay(alignment: .top) {
                if run.routeProgress?.isOffRoute == true {
                    Label(String(localized: "watch.route.offRoute", defaultValue: "Off route"), systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: WatchStyle.s(13), weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, WatchStyle.s(8))
                        .padding(.vertical, WatchStyle.s(3))
                        .background(Color.red, in: Capsule())
                        // Under the system clock, which sits over the top.
                        .padding(.top, WatchStyle.s(22))
                }
            }
        } else {
            Color.clear
        }
    }

    /// "3.42 km", in the phone's unit.
    private func remainingText(_ progress: WatchRouteTracker.Snapshot) -> String {
        let unit = usesMiles ? String(localized: "watch.unit.mi", defaultValue: "mi") : String(localized: "watch.unit.km", defaultValue: "km")
        return "\(WatchRunMetrics.distanceText(progress.remainingMeters, usesMiles: usesMiles)) \(unit)"
    }

    /// "Climb ahead: +24 m in 400 m", in the phone's unit.
    private func climbAheadText(_ climb: WatchRouteClimb.Ahead) -> String {
        let gain = usesMiles
            ? "\(Int((Double(climb.gainMeters) * 3.28084).rounded())) ft"
            : "\(climb.gainMeters) m"
        let over = WatchRunPlan.distance(max(10, (climb.overMeters / 10).rounded() * 10), inMiles: usesMiles)
        return String(localized: "watch.route.climbAhead", defaultValue: "Climb ahead: +\(gain) in \(over)")
    }

    private var footer: some View {
        VStack(spacing: 0) {
            if let approach = run.routeProgress?.startApproach {
                // The map is north up until the line is reached, so the arrow is the bearing itself.
                Label {
                    Text(startAwayText(approach, usesMiles: usesMiles))
                } icon: {
                    Image(systemName: "location.north.fill")
                        .rotationEffect(.degrees(approach.arrowRotation(heading: nil)))
                }
                .font(.system(size: WatchStyle.s(15), weight: .bold, design: .rounded))
                .foregroundStyle(.cyan)
            } else if let progress = run.routeProgress {
                Text(String(localized: "watch.route.left", defaultValue: "\(remainingText(progress)) left"))
                .font(.system(size: WatchStyle.s(15), weight: .bold, design: .rounded))
                .monospacedDigit()
                if let race = run.routeRace {
                    RaceLabel(race: race)
                        .font(.system(size: WatchStyle.s(12), weight: .bold))
                }
                if let rejoin = progress.rejoin {
                    Label {
                        Text(rejoin.instruction(usesMiles: usesMiles))
                    } icon: {
                        Image(systemName: "location.north.fill")
                            .rotationEffect(.degrees(rejoin.arrowRotation(heading: nil)))
                    }
                    .font(.system(size: WatchStyle.s(11), weight: .semibold))
                    .foregroundStyle(.orange)
                }
                if let climb = run.routeClimb {
                    Label {
                        Text(climbAheadText(climb))
                    } icon: {
                        Image(systemName: "arrow.up.right")
                    }
                    .font(.system(size: WatchStyle.s(11), weight: .semibold))
                    .foregroundStyle(.orange)
                }
                if !progress.isOffRoute, !progress.arrived, let next = progress.nextCue {
                    Label {
                        Text("\(next.cue.instruction) · \(WatchRunPlan.distance(next.distanceMeters, inMiles: usesMiles))")
                    } icon: {
                        Image(systemName: next.cue.kind.symbol)
                    }
                    .font(.system(size: WatchStyle.s(11), weight: .semibold))
                    .foregroundStyle(.cyan)
                }
            } else {
                Text(String(localized: "watch.route.waitingGps", defaultValue: "Waiting for GPS"))
                    .font(.system(size: WatchStyle.s(12), weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(.horizontal, WatchStyle.s(8))
        .padding(.vertical, WatchStyle.s(2))
        .frame(maxWidth: .infinity)
        .background(.black.opacity(0.6))
    }
}

/// The whole route on one screen, the page after the followed map.
struct WatchRouteOverviewPage: View {
    var body: some View {
        WatchRouteMapPage(mode: .overview)
    }
}

enum RouteMapMode {
    /// Close around the wearer, heading up.
    case follow
    /// The whole route, north up.
    case overview
}

/// North arrow and scale bar for the offline map, which has no street names or
/// labels to read the direction and size from. The arrow turns against the map
/// (the map is heading up while a route is followed), and the bar is a round
/// length drawn to the screen's approximate scale.
private struct OfflineMapChrome: View {
    /// Degrees clockwise from north that point up the screen; 0 is north up.
    let heading: Double
    /// Metres across the screen's width, approximately.
    let acrossMeters: Double
    let usesMiles: Bool

    var body: some View {
        GeometryReader { geometry in
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 2) {
                    Image(systemName: "location.north.fill")
                        .rotationEffect(.degrees(-heading))
                    Text(String(localized: "watch.route.north", defaultValue: "N"))
                }
                .font(.system(size: WatchStyle.s(11), weight: .bold))
                if let bar = WatchRouteFootprint.scaleBarMeters(acrossMeters: acrossMeters), acrossMeters > 0 {
                    Rectangle()
                        .frame(width: geometry.size.width * bar / acrossMeters, height: 2)
                    Text(WatchRunPlan.distance(bar, inMiles: usesMiles))
                        .font(.system(size: WatchStyle.s(10), weight: .semibold))
                        .monospacedDigit()
                }
            }
            .foregroundStyle(.white.opacity(0.85))
            .shadow(color: .black, radius: 1.5)
            // Under the system clock, which sits over the top.
            .padding(.top, WatchStyle.s(22))
            .padding(.leading, WatchStyle.s(6))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The map and what is drawn on it. MapKit places everything, so the route
/// lines up with the roads whatever shape the screen is.
///
/// A route that carries a footprint also draws those nearby paths as thin grey
/// lines under it, with a north arrow and a scale bar. They are overlays like
/// the route, so they turn with the heading-up camera and are there whether or
/// not MapKit has any tiles (it gives no signal for that); with tiles they are
/// a faint extra, without them they are the only context around the route.
private struct RouteMapLayer: View {
    let route: WatchRoute
    let progress: WatchRouteTracker.Snapshot?
    let position: WatchRoutePoint?
    let mode: RouteMapMode
    /// Where to rejoin the line while off it; a dashed line leads there.
    let rejoin: WatchRouteRejoin?
    let usesMiles: Bool

    private let cumulative: [Double]

    init(
        route: WatchRoute,
        progress: WatchRouteTracker.Snapshot?,
        position: WatchRoutePoint?,
        mode: RouteMapMode,
        rejoin: WatchRouteRejoin? = nil,
        usesMiles: Bool
    ) {
        self.route = route
        self.progress = progress
        self.position = position
        self.mode = mode
        self.rejoin = rejoin
        self.usesMiles = usesMiles
        cumulative = WatchRouteTracker.cumulativeDistances(route.points)
    }

    var body: some View {
        // The point the wearer has reached; everything before it is done.
        let reached = progress.map { reachedIndex(progressMeters: $0.progressMeters) } ?? 0
        let done = route.points[0...reached].map(Self.coordinate)
        let ahead = route.points[reached...].map(Self.coordinate)
        let off = progress?.isOffRoute == true

        Map(position: .constant(mapPosition), interactionModes: []) {
            // Known paths nearby, under everything else.
            if let footprint = route.footprint {
                ForEach(Array(footprint.enumerated()), id: \.offset) { _, line in
                    MapPolyline(coordinates: line.map(Self.coordinate))
                        .stroke(.gray.opacity(0.55), lineWidth: 2)
                }
            }
            if done.count > 1 {
                MapPolyline(coordinates: done).stroke(.gray.opacity(0.8), lineWidth: 5)
            }
            if ahead.count > 1 {
                // A white edge under the cyan keeps the line readable over
                // parks, water and busy streets.
                MapPolyline(coordinates: ahead).stroke(.white, lineWidth: 10)
                MapPolyline(coordinates: ahead).stroke(.cyan, lineWidth: 6)
            }

            // From the wearer to where the line is nearest ahead.
            if let position, let rejoin {
                MapPolyline(coordinates: [Self.coordinate(position), Self.coordinate(rejoin.point)])
                    .stroke(.orange, style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [5, 5]))
            }

            // Start and finish.
            if let first = route.points.first, let last = route.points.last {
                Annotation("", coordinate: Self.coordinate(first), anchor: .center) {
                    Self.dot(.green, size: 10)
                }
                Annotation("", coordinate: Self.coordinate(last), anchor: .center) {
                    Self.dot(.white, size: 10)
                }
            }

            // The next turn.
            if let next = progress?.nextCue, next.cue.kind != .depart {
                let index = min(next.cue.index, route.points.count - 1)
                Annotation("", coordinate: Self.coordinate(route.points[index]), anchor: .center) {
                    Image(systemName: next.cue.kind.symbol)
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(Color.orange))
                        .overlay(Circle().stroke(Color.white, lineWidth: 2))
                }
            }

            // The wearer.
            if let position {
                Annotation("", coordinate: Self.coordinate(position), anchor: .center) {
                    Circle()
                        .fill(off ? Color.red : Color.blue)
                        .frame(width: 14, height: 14)
                        .overlay(Circle().stroke(Color.white, lineWidth: 3))
                }
            }
        }
        .mapStyle(.standard(emphasis: .muted, pointsOfInterest: .excludingAll))
        // The compass badge MapKit adds once the map turns sits on the page dots.
        .mapControlVisibility(.hidden)
        .overlay {
            if route.footprint != nil {
                OfflineMapChrome(
                    heading: followCamera?.heading ?? 0,
                    acrossMeters: acrossMeters,
                    usesMiles: usesMiles
                )
            }
        }
        .accessibilityLabel(route.name)
    }

    /// Where the camera is while following; nil in the overview.
    private var followCamera: WatchRouteCamera? {
        guard mode == .follow, let position else { return nil }
        return WatchRouteCamera.follow(
            route: route,
            cumulative: cumulative,
            progress: progress,
            position: position
        )
    }

    /// About how many metres the map shows across the screen, for the scale bar.
    private var acrossMeters: Double {
        if let camera = followCamera {
            return WatchRouteFootprint.acrossMeters(cameraDistance: camera.distance)
        }
        return region.span.longitudeDelta
            * WatchRouteFootprint.metersPerDegreeLongitude(at: region.center.latitude)
    }

    private var mapPosition: MapCameraPosition {
        guard let camera = followCamera else { return .region(region) }
        return .camera(MapCamera(
            centerCoordinate: CLLocationCoordinate2D(latitude: camera.lat, longitude: camera.lon),
            distance: camera.distance,
            heading: camera.heading,
            pitch: 0
        ))
    }

    /// The route, with a margin for the clock above and the footer below; the
    /// wearer too while off the route, so the dot stays on the screen.
    private var region: MKCoordinateRegion {
        var lats = route.points.map(\.lat)
        var lons = route.points.map(\.lon)
        if let position, progress?.isOffRoute == true {
            lats.append(position.lat)
            lons.append(position.lon)
        }
        let minLat = lats.min() ?? 0
        let maxLat = lats.max() ?? 0
        let minLon = lons.min() ?? 0
        let maxLon = lons.max() ?? 0
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2),
            span: MKCoordinateSpan(
                latitudeDelta: max((maxLat - minLat) * 1.7, 0.004),
                longitudeDelta: max((maxLon - minLon) * 1.4, 0.004)
            )
        )
    }

    /// The last point at or before `progressMeters` along the line.
    private func reachedIndex(progressMeters: Double) -> Int {
        var low = 0
        var high = cumulative.count - 1
        while low < high {
            let mid = (low + high + 1) / 2
            if cumulative[mid] <= progressMeters { low = mid } else { high = mid - 1 }
        }
        return low
    }

    private static func coordinate(_ point: WatchRoutePoint) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: point.lat, longitude: point.lon)
    }

    private static func dot(_ color: Color, size: CGFloat) -> some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .overlay(Circle().stroke(Color.black.opacity(0.5), lineWidth: 1.5))
    }
}
