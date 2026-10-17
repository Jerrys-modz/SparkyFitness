import XCTest
@testable import WatchRoute

final class WatchRouteClimbTests: XCTestCase {
    private let metersPerDegreeLat = 111_195.0

    /// A straight line north, a point every 100 m, with the given heights.
    private func route(_ heights: [Int]?, count: Int = 11) -> WatchRoute {
        let points = (0..<count).map { WatchRoutePoint(lat: 51.5 + Double($0) * 100 / metersPerDegreeLat, lon: -0.12) }
        return WatchRoute(id: "climb", name: "Climb", points: points, cues: [], elevations: heights)
    }

    private func ahead(_ route: WatchRoute, at progress: Double) -> WatchRouteClimb.Ahead? {
        WatchRouteClimb.ahead(
            route: route,
            cumulative: WatchRouteTracker.cumulativeDistances(route.points),
            progressMeters: progress
        )
    }

    func testAClimbOfTwentyFourMetresInFourHundred() throws {
        // 0..1000 m; flat for 100 m, then +6 m per 100 m for 400 m.
        let r = route([100, 100, 106, 112, 118, 124, 124, 124, 124, 124, 124])
        let climb = try XCTUnwrap(ahead(r, at: 100))
        XCTAssertEqual(climb.gainMeters, 24)
        XCTAssertEqual(climb.overMeters, 400, accuracy: 3)
    }

    func testTheWindowIsFourHundredMetres() throws {
        // Starting at 0 the rise to 124 m is 500 m away, so only 18 m falls inside.
        let r = route([100, 100, 106, 112, 118, 124, 124, 124, 124, 124, 124])
        let climb = try XCTUnwrap(ahead(r, at: 0))
        XCTAssertEqual(climb.gainMeters, 18)
        XCTAssertEqual(climb.overMeters, 400, accuracy: 3)
    }

    func testAnInterpolatedPositionBetweenPoints() throws {
        let r = route([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) // 10 m per 100 m
        let climb = try XCTUnwrap(ahead(r, at: 50))
        XCTAssertEqual(climb.gainMeters, 40)
        XCTAssertEqual(climb.overMeters, 400, accuracy: 3)
    }

    func testLessThanTenMetresIsNotMentioned() {
        let r = route([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 109])
        XCTAssertNil(ahead(r, at: 0)) // 4 m in 400 m
    }

    func testExactlyTenMetresCounts() throws {
        let r = route([0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10])
        XCTAssertEqual(try XCTUnwrap(ahead(r, at: 100)).gainMeters, 10)
    }

    func testADescentIsNotAClimb() {
        let r = route([200, 190, 180, 170, 160, 150, 140, 130, 120, 110, 100])
        XCTAssertNil(ahead(r, at: 0))
    }

    func testACrestThenDropReportsTheClimbToTheCrest() throws {
        let r = route([100, 115, 130, 140, 120, 100, 90, 90, 90, 90, 90])
        let climb = try XCTUnwrap(ahead(r, at: 0))
        XCTAssertEqual(climb.gainMeters, 40)
        XCTAssertEqual(climb.overMeters, 300, accuracy: 3)
    }

    func testTheEndOfTheRouteShortensTheWindow() throws {
        let r = route([0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 24])
        let climb = try XCTUnwrap(ahead(r, at: 800))
        XCTAssertEqual(climb.gainMeters, 24)
        XCTAssertEqual(climb.overMeters, 200, accuracy: 3)
        XCTAssertNil(ahead(r, at: 1000)) // nothing left
    }

    func testNoHeightsNoClimb() {
        XCTAssertNil(ahead(route(nil), at: 0))
    }

    func testHeightsThatDoNotMatchThePointsAreIgnored() {
        XCTAssertNil(ahead(route([0, 50, 100]), at: 0))
    }

    func testZigzagStepsDecodeToHeights() {
        // Heights 100, 101, 99, 99, -3 as steps from 0: +100, +1, -2, 0, -102.
        XCTAssertEqual(WatchRouteClimb.decodeHeights([200, 2, 3, 0, 203]), [100, 101, 99, 99, -3])
        XCTAssertEqual(WatchRouteClimb.decodeHeights([]), [])
    }

    func testASavedRouteKeepsItsHeightsAndOldOnesDecodeWithout() throws {
        let with = route([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        let decoded = try JSONDecoder().decode(WatchRoute.self, from: JSONEncoder().encode(with))
        XCTAssertEqual(decoded, with)
        XCTAssertEqual(decoded.elevations, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

        let old = #"{"id":"a","name":"A","points":[{"lat":1,"lon":2},{"lat":1.1,"lon":2}],"cues":[]}"#
        let legacy = try JSONDecoder().decode(WatchRoute.self, from: Data(old.utf8))
        XCTAssertNil(legacy.elevations)
    }
}
