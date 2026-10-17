import XCTest
@testable import WatchRoute

final class WatchRouteFootprintTests: XCTestCase {
    private func line(_ count: Int, lat: Double = 51_500_000) -> [Double] {
        (0..<count).flatMap { [lat + Double($0) * 10, -120_000 + Double($0) * 10] }
    }

    func testDecodesMicroDegreesToPoints() throws {
        let lines = try XCTUnwrap(WatchRouteFootprint.decode([[51_500_000, -120_000, 51_500_100, -119_900]]))
        XCTAssertEqual(lines.count, 1)
        XCTAssertEqual(lines[0][0], WatchRoutePoint(lat: 51.5, lon: -0.12))
        XCTAssertEqual(lines[0][1].lat, 51.5001, accuracy: 1e-9)
        XCTAssertEqual(lines[0][1].lon, -0.1199, accuracy: 1e-9)
    }

    func testSkipsOddAndTooShortLines() throws {
        let lines = try XCTUnwrap(WatchRouteFootprint.decode([
            [1, 2, 3],          // odd count
            [1, 2],             // one point
            [],                 // empty
            line(3),            // good
        ]))
        XCTAssertEqual(lines.count, 1)
        XCTAssertEqual(lines[0].count, 3)
    }

    func testNothingUsableIsNil() {
        XCTAssertNil(WatchRouteFootprint.decode([]))
        XCTAssertNil(WatchRouteFootprint.decode([[1, 2]]))
    }

    func testCapsLinesAndPoints() throws {
        let many = Array(repeating: line(5), count: 40)
        XCTAssertEqual(try XCTUnwrap(WatchRouteFootprint.decode(many)).count, WatchRouteFootprint.maxLines)

        // 11 lines of 100 points: six fill the 600-point cap exactly, the rest do not fit.
        let big = Array(repeating: line(100), count: 11)
        let kept = try XCTUnwrap(WatchRouteFootprint.decode(big))
        XCTAssertEqual(kept.count, 6)
        XCTAssertLessThanOrEqual(kept.reduce(0) { $0 + $1.count }, WatchRouteFootprint.maxPoints)
    }

    func testAcrossFollowsCameraDistance() {
        XCTAssertEqual(WatchRouteFootprint.acrossMeters(cameraDistance: 450), 200, accuracy: 0.001)
        XCTAssertEqual(WatchRouteFootprint.acrossMeters(cameraDistance: 1000), 444.44, accuracy: 0.01)
    }

    func testScaleBarIsARoundLengthInAboutAThird() {
        XCTAssertEqual(WatchRouteFootprint.scaleBarMeters(acrossMeters: 200), 50)   // 66 m -> 50
        XCTAssertEqual(WatchRouteFootprint.scaleBarMeters(acrossMeters: 444), 100)  // 148 -> 100
        XCTAssertEqual(WatchRouteFootprint.scaleBarMeters(acrossMeters: 1500), 500) // 500 -> 500
        XCTAssertEqual(WatchRouteFootprint.scaleBarMeters(acrossMeters: 6000), 2000)
        XCTAssertEqual(WatchRouteFootprint.scaleBarMeters(acrossMeters: 30), 10)
    }

    func testScaleBarNilWhenTooSmallOrBad() {
        XCTAssertNil(WatchRouteFootprint.scaleBarMeters(acrossMeters: 2))
        XCTAssertNil(WatchRouteFootprint.scaleBarMeters(acrossMeters: .infinity))
        XCTAssertNil(WatchRouteFootprint.scaleBarMeters(acrossMeters: .nan))
    }

    func testLongitudeMetersShrinkWithLatitude() {
        XCTAssertEqual(WatchRouteFootprint.metersPerDegreeLongitude(at: 0), 111_320, accuracy: 0.01)
        XCTAssertEqual(WatchRouteFootprint.metersPerDegreeLongitude(at: 60), 55_660, accuracy: 0.5)
    }
}
