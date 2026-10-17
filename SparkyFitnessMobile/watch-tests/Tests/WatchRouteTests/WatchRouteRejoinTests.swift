import XCTest
@testable import WatchRoute

final class WatchRouteRejoinTests: XCTestCase {
    private let originLat = 51.5
    private let originLon = -0.12
    private let metersPerDegreeLat = 111_195.0
    private var metersPerDegreeLon: Double { metersPerDegreeLat * cos(originLat * .pi / 180) }

    /// A point `east`/`north` metres from the origin.
    private func at(_ east: Double, _ north: Double) -> WatchRoutePoint {
        WatchRoutePoint(lat: originLat + north / metersPerDegreeLat, lon: originLon + east / metersPerDegreeLon)
    }

    /// 400 m north, then 400 m east, a point every 10 m.
    private var lRoute: WatchRoute {
        var points: [WatchRoutePoint] = []
        for i in 0...40 { points.append(at(0, Double(i) * 10)) }
        for i in 1...40 { points.append(at(Double(i) * 10, 400)) }
        return WatchRoute(id: "l", name: "L", points: points, cues: [])
    }

    /// 200 m north, 100 m east, 200 m south, 100 m west: it ends where it began.
    private var loop: WatchRoute {
        var points: [WatchRoutePoint] = []
        for i in 0...20 { points.append(at(0, Double(i) * 10)) }
        for i in 1...10 { points.append(at(Double(i) * 10, 200)) }
        for i in 1...20 { points.append(at(100, 200 - Double(i) * 10)) }
        for i in 1...10 { points.append(at(100 - Double(i) * 10, 0)) }
        return WatchRoute(id: "loop", name: "Loop", points: points, cues: [])
    }

    private func plan(_ route: WatchRoute, from here: WatchRoutePoint, progress: Double) -> WatchRouteRejoin? {
        WatchRouteRejoin.plan(
            from: here,
            route: route,
            cumulative: WatchRouteTracker.cumulativeDistances(route.points),
            progressMeters: progress
        )
    }

    // MARK: - Where to rejoin

    func testTheNearestPointOnTheLineAhead() throws {
        // 80 m east of the first leg, having got 200 m along it.
        let rejoin = try XCTUnwrap(plan(lRoute, from: at(80, 200), progress: 200))
        XCTAssertEqual(rejoin.distanceMeters, 80, accuracy: 2)
        XCTAssertEqual(rejoin.along, 200, accuracy: 3)
        // The point is due west of the wearer.
        XCTAssertEqual(rejoin.bearing, 270, accuracy: 1)
    }

    func testNotSentBackToAPointAlreadyPassed() throws {
        // 300 m along, now 50 m east and level with the 250 m mark. That mark is
        // the nearest point (50 m) but it is behind; the line ahead is 64 m away.
        let rejoin = try XCTUnwrap(plan(lRoute, from: at(50, 250), progress: 300))
        XCTAssertGreaterThanOrEqual(rejoin.along, 285)
        XCTAssertEqual(rejoin.along, 290, accuracy: 3)
        XCTAssertEqual(rejoin.distanceMeters, 64, accuracy: 2)
    }

    func testAPassedPointIsUsedWhenItIsMuchNearer() throws {
        // 30 m from the 100 m mark, but the line ahead starts 187 m away.
        let rejoin = try XCTUnwrap(plan(lRoute, from: at(30, 100), progress: 300))
        XCTAssertEqual(rejoin.along, 100, accuracy: 3)
        XCTAssertEqual(rejoin.distanceMeters, 30, accuracy: 2)
    }

    func testAWearerWhoCutACornerIsSentToWhereTheLineComesBack() throws {
        // Last on the line at 100 m; now across the corner, 100 m south of the
        // east leg. The way ahead nearest to them is the east leg, 550 m along.
        let rejoin = try XCTUnwrap(plan(lRoute, from: at(150, 300), progress: 100))
        XCTAssertEqual(rejoin.along, 550, accuracy: 5)
        XCTAssertEqual(rejoin.distanceMeters, 100, accuracy: 2)
        // Due north of them.
        XCTAssertEqual(rejoin.bearing, 0, accuracy: 1)
    }

    func testALoopWearerWhoHasNotRunItYetIsSentToTheStart() throws {
        // Start and finish are the same spot, equally near: the start wins.
        let rejoin = try XCTUnwrap(plan(loop, from: at(-40, -10), progress: 0))
        XCTAssertEqual(rejoin.along, 0, accuracy: 3)
        XCTAssertEqual(rejoin.distanceMeters, 41, accuracy: 2)
    }

    func testALoopWearerNearlyDoneIsSentToTheFinish() throws {
        let rejoin = try XCTUnwrap(plan(loop, from: at(-40, -10), progress: 590))
        XCTAssertEqual(rejoin.along, 600, accuracy: 3)
    }

    func testARouteWithNoLineGivesNothing() {
        let single = WatchRoute(id: "x", name: "x", points: [at(0, 0)], cues: [])
        XCTAssertNil(WatchRouteRejoin.plan(from: at(10, 10), route: single, cumulative: [0], progressMeters: 0))
    }

    // MARK: - Which way

    private func rejoin(bearing: Double) -> WatchRouteRejoin {
        WatchRouteRejoin(point: at(0, 0), along: 0, distanceMeters: 80, bearing: bearing)
    }

    func testSideRelativeToTheWearersCourse() {
        let west = rejoin(bearing: 270)
        XCTAssertEqual(west.side(course: 0), .left)
        XCTAssertEqual(west.side(course: 180), .right)
        XCTAssertEqual(west.side(course: 270), .ahead)
        XCTAssertEqual(west.side(course: 90), .behind)
        XCTAssertEqual(west.side(course: 300), .ahead)
        XCTAssertNil(west.side(course: nil))
    }

    func testTheSideAcrossNorth() {
        // Heading 350, point at 10: 20 degrees to the right, still ahead.
        XCTAssertEqual(rejoin(bearing: 10).side(course: 350), .ahead)
        // Heading 350, point at 70: 80 degrees right.
        XCTAssertEqual(rejoin(bearing: 70).side(course: 350), .right)
    }

    func testTheArrowTurnsFromTheWearersHeading() {
        let west = rejoin(bearing: 270)
        XCTAssertEqual(west.arrowRotation(heading: nil), 270, accuracy: 0.001)
        XCTAssertEqual(west.arrowRotation(heading: 0), 270, accuracy: 0.001)
        XCTAssertEqual(west.arrowRotation(heading: 90), 180, accuracy: 0.001)
        XCTAssertEqual(west.arrowRotation(heading: 300), 330, accuracy: 0.001)
    }

    // MARK: - On the tracker's snapshot

    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    func testTheSnapshotCarriesTheRejoinOnlyOnceOffRoute() throws {
        var tracker = try XCTUnwrap(WatchRouteTracker(route: lRoute))
        let onLine = at(0, 200)
        _ = tracker.update(lat: onLine.lat, lon: onLine.lon, accuracy: 5, at: t0 - 10)

        let away = at(80, 200)
        let brief = try XCTUnwrap(tracker.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0))
        XCTAssertFalse(brief.snapshot.isOffRoute)
        XCTAssertNil(brief.snapshot.rejoin)

        let off = try XCTUnwrap(tracker.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0 + 6))
        XCTAssertTrue(off.snapshot.isOffRoute)
        let rejoin = try XCTUnwrap(off.snapshot.rejoin)
        XCTAssertEqual(rejoin.distanceMeters, 80, accuracy: 3)
        XCTAssertEqual(rejoin.along, 200, accuracy: 3)

        // It follows the wearer with each fix.
        let closer = at(60, 200)
        let nearer = try XCTUnwrap(tracker.update(lat: closer.lat, lon: closer.lon, accuracy: 5, at: t0 + 7))
        XCTAssertTrue(nearer.snapshot.isOffRoute)
        XCTAssertEqual(nearer.snapshot.rejoin?.distanceMeters ?? 0, 60, accuracy: 3)

        let back = at(5, 210)
        let rejoined = try XCTUnwrap(tracker.update(lat: back.lat, lon: back.lon, accuracy: 5, at: t0 + 8))
        XCTAssertNil(rejoined.snapshot.rejoin)
    }

    func testNoRejoinWhileStillGettingToTheStart() throws {
        var tracker = try XCTUnwrap(WatchRouteTracker(route: lRoute))
        let far = at(300, -300)
        let update = try XCTUnwrap(tracker.update(lat: far.lat, lon: far.lon, accuracy: 5, at: t0 + 30))
        XCTAssertFalse(update.snapshot.reachedRoute)
        XCTAssertNil(update.snapshot.rejoin)
        XCTAssertNotNil(update.snapshot.startApproach)
    }
}
