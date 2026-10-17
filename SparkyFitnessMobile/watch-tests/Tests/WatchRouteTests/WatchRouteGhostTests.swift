import XCTest
@testable import WatchRoute

final class WatchRouteGhostTests: XCTestCase {
    /// The best run's time at 100 m, 200 m and the 300 m finish.
    private let ghost = [30, 70, 120]

    // MARK: - The pace line

    func testDecodeKeepsARisingLineOfWholeSeconds() {
        XCTAssertEqual(WatchRouteGhost.decode([30, 61, 61, 95]), [30, 61, 61, 95])
    }

    func testDecodeDropsAnythingUnusable() {
        XCTAssertNil(WatchRouteGhost.decode(nil))
        XCTAssertNil(WatchRouteGhost.decode([]))
        XCTAssertNil(WatchRouteGhost.decode([30, 20]))
        XCTAssertNil(WatchRouteGhost.decode([30, 40.5]))
        XCTAssertNil(WatchRouteGhost.decode([0, 0]))
        XCTAssertNil(WatchRouteGhost.decode([.nan]))
        XCTAssertNil(WatchRouteGhost.decode((1...1001).map { Double($0) }))
    }

    func testTimeInterpolatesBetweenEntries() {
        XCTAssertEqual(WatchRouteGhost.time(atMeters: 0, ghost: ghost, totalMeters: 300), 0)
        XCTAssertEqual(WatchRouteGhost.time(atMeters: 50, ghost: ghost, totalMeters: 300), 15, accuracy: 0.001)
        XCTAssertEqual(WatchRouteGhost.time(atMeters: 100, ghost: ghost, totalMeters: 300), 30, accuracy: 0.001)
        XCTAssertEqual(WatchRouteGhost.time(atMeters: 150, ghost: ghost, totalMeters: 300), 50, accuracy: 0.001)
        XCTAssertEqual(WatchRouteGhost.time(atMeters: 250, ghost: ghost, totalMeters: 300), 95, accuracy: 0.001)
    }

    func testTheLastEntryIsTheEndOfTheRouteWhateverItsLength() {
        // 250 m: entries at 100 m, 200 m and the finish.
        let line = [40, 80, 100]
        XCTAssertEqual(WatchRouteGhost.time(atMeters: 225, ghost: line, totalMeters: 250), 90, accuracy: 0.001)
        XCTAssertEqual(WatchRouteGhost.time(atMeters: 250, ghost: line, totalMeters: 250), 100, accuracy: 0.001)
    }

    func testAtAndPastTheEndIsTheWholeTime() {
        XCTAssertEqual(WatchRouteGhost.time(atMeters: 300, ghost: ghost, totalMeters: 300), 120)
        XCTAssertEqual(WatchRouteGhost.time(atMeters: 900, ghost: ghost, totalMeters: 300), 120)
    }

    func testAShortRouteHasOneEntry() {
        XCTAssertEqual(WatchRouteGhost.time(atMeters: 40, ghost: [60], totalMeters: 80), 30, accuracy: 0.001)
    }

    // MARK: - Ahead and behind

    private func compare(progress: Double, elapsed: Double, ghost line: [Int]? = nil, onRoute: Bool = true) -> WatchRouteRace? {
        WatchRouteRace.compare(
            ghost: line ?? ghost,
            progressMeters: progress,
            totalMeters: 300,
            elapsedSeconds: elapsed,
            onRoute: onRoute
        )
    }

    func testAheadOfTheBestRun() {
        // Halfway the best run was at 50 s; 38 s is 12 s ahead.
        let race = compare(progress: 150, elapsed: 38)
        XCTAssertEqual(race, WatchRouteRace(seconds: 12, standing: .ahead))
        XCTAssertEqual(race?.text, "Ahead 12 s")
    }

    func testBehindTheBestRun() {
        let race = compare(progress: 150, elapsed: 58.4)
        XCTAssertEqual(race, WatchRouteRace(seconds: 8, standing: .behind))
        XCTAssertEqual(race?.text, "Behind 8 s")
    }

    func testWithinASecondIsEven() {
        XCTAssertEqual(compare(progress: 150, elapsed: 50.4), WatchRouteRace(seconds: 0, standing: .even))
    }

    func testNoPaceLineMeansNoRace() {
        XCTAssertNil(WatchRouteRace.compare(ghost: nil, progressMeters: 150, totalMeters: 300, elapsedSeconds: 40, onRoute: true))
        XCTAssertNil(WatchRouteRace.compare(ghost: [], progressMeters: 150, totalMeters: 300, elapsedSeconds: 40, onRoute: true))
    }

    func testNothingToCompareBeforeTheStart() {
        XCTAssertNil(compare(progress: 0, elapsed: 5))
        XCTAssertNil(compare(progress: 29, elapsed: 5))
        XCTAssertNotNil(compare(progress: 30, elapsed: 5))
    }

    func testNoRaceWhileOffTheRoute() {
        XCTAssertNil(compare(progress: 150, elapsed: 40, onRoute: false))
    }

    func testAtTheEndTheMarginIsAgainstTheWholeBestTime() {
        XCTAssertEqual(compare(progress: 300, elapsed: 130), WatchRouteRace(seconds: 10, standing: .behind))
        XCTAssertEqual(compare(progress: 300, elapsed: 105), WatchRouteRace(seconds: 15, standing: .ahead))
        // A fix a little past the end reads the same.
        XCTAssertEqual(compare(progress: 310, elapsed: 130), WatchRouteRace(seconds: 10, standing: .behind))
    }

    func testAMinuteOrMoreReadsAsMinutes() {
        XCTAssertEqual(WatchRouteRace(seconds: 75, standing: .behind).text, "Behind 1:15")
        XCTAssertEqual(WatchRouteRace(seconds: 0, standing: .even).text, "Even with your best")
    }

    // MARK: - The alert

    private let now = Date(timeIntervalSince1970: 1_000_000)

    func testAlertsWhenGoingFromAheadToBehind() {
        XCTAssertTrue(WatchRouteRace.shouldAlert(previous: .ahead, current: .behind, lastAlertAt: nil, now: now))
    }

    func testOnlyOnTheChange() {
        XCTAssertFalse(WatchRouteRace.shouldAlert(previous: .behind, current: .behind, lastAlertAt: nil, now: now))
        XCTAssertFalse(WatchRouteRace.shouldAlert(previous: .ahead, current: .ahead, lastAlertAt: nil, now: now))
        XCTAssertFalse(WatchRouteRace.shouldAlert(previous: .behind, current: .ahead, lastAlertAt: nil, now: now))
        XCTAssertFalse(WatchRouteRace.shouldAlert(previous: nil, current: .behind, lastAlertAt: nil, now: now))
    }

    func testNotMoreThanOnceEveryTwoMinutes() {
        XCTAssertFalse(WatchRouteRace.shouldAlert(previous: .ahead, current: .behind, lastAlertAt: now - 119, now: now))
        XCTAssertTrue(WatchRouteRace.shouldAlert(previous: .ahead, current: .behind, lastAlertAt: now - 120, now: now))
    }
}
