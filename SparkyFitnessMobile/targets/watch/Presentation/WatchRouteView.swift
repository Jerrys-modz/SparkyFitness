import SwiftUI

/// What the wearer needs from a followed route at a glance, shown under the
/// clock on the run's main page: the next turn and how far, or a red warning
/// when they have left the route.
struct RouteCueStrip: View {
    let progress: WatchRouteTracker.Snapshot?
    let usesMiles: Bool

    var body: some View {
        HStack(spacing: WatchStyle.s(6)) {
            Image(systemName: symbol)
                .font(.system(size: WatchStyle.s(15), weight: .bold))
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
        .padding(.horizontal, WatchStyle.s(8))
        .padding(.vertical, WatchStyle.s(4))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: WatchStyle.s(10), style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var isOff: Bool { progress?.isOffRoute == true }

    private var tint: Color { isOff ? .red : .cyan }

    private var symbol: String {
        if isOff { return "exclamationmark.triangle.fill" }
        guard let progress else { return "location.slash" }
        if progress.arrived { return WatchRouteCueKind.arrive.symbol }
        return progress.nextCue?.cue.kind.symbol ?? "arrow.up"
    }

    private var label: String {
        if isOff { return String(localized: "watch.route.offRoute", defaultValue: "Off route") }
        guard let progress else { return String(localized: "watch.route.waitingGps", defaultValue: "Waiting for GPS") }
        if progress.arrived { return WatchRouteCueKind.arrive.title }
        return progress.nextCue?.cue.instruction ?? WatchRouteCueKind.straight.title
    }

    private var distance: String? {
        guard let progress, !isOff, !progress.arrived, let next = progress.nextCue else { return nil }
        return WatchRunPlan.distance(next.distanceMeters, inMiles: usesMiles)
    }
}

/// The route page of a followed run: the route drawn north-up with the part
/// already covered greyed out, a dot for the wearer, a ring on the next turn,
/// and the distance left with the next instruction underneath.
///
/// Drawn with a `Canvas` rather than MapKit: a trail or a park often has no
/// signal to fetch tiles on, the route is all the wearer needs to see, and the
/// line stays sharp and cheap to redraw on every fix.
struct WatchRouteMapPage: View {
    @EnvironmentObject private var run: WatchRunStore
    @EnvironmentObject private var store: CheckInStore

    private var usesMiles: Bool { store.context.distanceUnit == "miles" }

    var body: some View {
        if let route = run.route {
            RouteCanvas(
                route: route,
                progress: run.routeProgress,
                position: run.routePosition
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

    private var footer: some View {
        VStack(spacing: 0) {
            if let progress = run.routeProgress {
                Text(String(localized: "watch.route.left", defaultValue: "\(remainingText(progress)) left"))
                .font(.system(size: WatchStyle.s(15), weight: .bold, design: .rounded))
                .monospacedDigit()
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
        .padding(.vertical, WatchStyle.s(4))
        .frame(maxWidth: .infinity)
        .background(.black.opacity(0.7))
    }
}

/// The drawing. The fit and the cumulative distances come from the route alone;
/// they are rebuilt with the view on each fix, which at the 2000-point cap is
/// a few thousand floating-point operations.
private struct RouteCanvas: View {
    let route: WatchRoute
    let progress: WatchRouteTracker.Snapshot?
    let position: WatchRoutePoint?

    private let projection: WatchRouteProjection
    private let cumulative: [Double]

    init(route: WatchRoute, progress: WatchRouteTracker.Snapshot?, position: WatchRoutePoint?) {
        self.route = route
        self.progress = progress
        self.position = position
        projection = WatchRouteProjection(points: route.points)
        cumulative = WatchRouteTracker.cumulativeDistances(route.points)
    }

    var body: some View {
        Canvas { context, size in
            // Room for the clock above and the footer below.
            let top = WatchStyle.s(30)
            let bottom = WatchStyle.s(44)
            let margin = WatchStyle.s(12)
            let area = CGRect(
                x: margin, y: top,
                width: max(1, size.width - 2 * margin),
                height: max(1, size.height - top - bottom)
            )
            let box = Self.fit(aspect: projection.aspect, in: area)
            func place(_ point: WatchRoutePoint) -> CGPoint {
                let unit = projection.normalized(point)
                return CGPoint(x: box.minX + unit.x * box.width, y: box.minY + unit.y * box.height)
            }

            // The point the wearer has reached; everything before it is done.
            let reached = progress.map { reachedIndex(progressMeters: $0.progressMeters) } ?? 0
            var done = Path()
            var ahead = Path()
            for (i, point) in route.points.enumerated() {
                let p = place(point)
                if i <= reached {
                    if i == 0 { done.move(to: p) } else { done.addLine(to: p) }
                }
                if i == reached { ahead.move(to: p) } else if i > reached { ahead.addLine(to: p) }
            }
            let style = StrokeStyle(lineWidth: WatchStyle.s(4), lineCap: .round, lineJoin: .round)
            context.stroke(done, with: .color(.gray.opacity(0.7)), style: style)
            context.stroke(ahead, with: .color(.cyan), style: style)

            // Start and finish.
            if let first = route.points.first, let last = route.points.last {
                dot(&context, at: place(first), radius: 4, fill: .green)
                dot(&context, at: place(last), radius: 4, fill: .white)
            }

            // The next turn.
            if let next = progress?.nextCue, next.cue.kind != .depart {
                let index = min(next.cue.index, route.points.count - 1)
                let ring = Path(ellipseIn: CGRect(
                    x: place(route.points[index]).x - 7, y: place(route.points[index]).y - 7,
                    width: 14, height: 14
                ))
                context.stroke(ring, with: .color(.orange), lineWidth: 2.5)
            }

            // The wearer, kept on the screen even when well off the route.
            if let position {
                var p = place(position)
                p.x = min(max(p.x, 6), size.width - 6)
                p.y = min(max(p.y, 6), size.height - 6)
                let tint: Color = progress?.isOffRoute == true ? .red : .blue
                dot(&context, at: p, radius: 8, fill: .white)
                dot(&context, at: p, radius: 5.5, fill: tint)
            }
        }
        .accessibilityLabel(route.name)
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

    private func dot(_ context: inout GraphicsContext, at point: CGPoint, radius: CGFloat, fill: Color) {
        let circle = Path(ellipseIn: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2))
        context.fill(circle, with: .color(fill))
    }

    /// The largest box of `aspect` (width over height) that fits `area`, centred.
    private static func fit(aspect: Double, in area: CGRect) -> CGRect {
        let a = CGFloat(max(aspect, 0.05))
        var width = area.width
        var height = width / a
        if height > area.height {
            height = area.height
            width = height * a
        }
        return CGRect(x: area.midX - width / 2, y: area.midY - height / 2, width: width, height: height)
    }
}
