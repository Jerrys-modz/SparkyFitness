#if DEBUG
import Foundation

/// A stand-in for the wrist sensors, so the workout pipeline can be exercised
/// in a simulator.
///
/// There is no heart rate in a watchOS simulator: `HKLiveWorkoutBuilder` runs,
/// but nothing ever feeds it, so `didCollectDataOf` never fires for
/// `.heartRate` and every stage downstream of it — batching, timestamps, the
/// energy delta, the queued transfer, the phone's buffer and flush, the
/// telemetry POST — has no way to run. Testing that on hardware needs a paid
/// Apple Developer account, so without this the whole chain is only ever read,
/// never observed.
///
/// `WorkoutHealthKitController` substitutes this for HealthKit when
/// `SPARKY_FAKE_HR=1` is in the launch environment, and feeds it through the
/// SAME buffer, batch timer and callbacks the real readings use. That is the
/// point: what gets tested is the shipping path with a different source at the
/// very top of it, not a parallel implementation that could agree with itself
/// while the real one is broken.
///
/// Distinct from `ScreenshotSeed`, which parks a single fixed BPM on the store
/// for a still photograph and never touches this controller. Separate flags,
/// and they do not interact.
///
/// `#if DEBUG` so none of it reaches a release build.
enum SyntheticWorkoutSignal {

    static var isEnabled: Bool {
        ProcessInfo.processInfo.environment["SPARKY_FAKE_HR"] == "1"
    }

    /// How often a reading is produced. A real optical sensor reports every
    /// few seconds during a workout, and matching that order of magnitude
    /// matters: it decides how many samples a one-minute batch carries, which
    /// is the thing worth watching for at the phone end.
    static let sampleInterval: TimeInterval = 2

    /// Heart rate at a given point into the workout: a warm-up ramp toward a
    /// working rate, with a slow swing on top so consecutive readings differ
    /// the way real ones do.
    ///
    /// The swing is deliberately wider than sensor noise and on a set-and-rest
    /// period, because a flat line would hide exactly the bugs this is for —
    /// a series that was never really per-sample, or timestamps that collapsed
    /// onto one instant, both look fine when every value is identical.
    static func bpm(atElapsed elapsed: TimeInterval) -> Double {
        let resting = 72.0
        let working = 148.0
        let rampSeconds = 180.0
        let ramp = min(1, max(0, elapsed) / rampSeconds)
        let base = resting + (working - resting) * ramp
        let swing = 9 * sin(elapsed * 2 * .pi / 40)
        return (base + swing).rounded()
    }

    /// Active energy burned over one sample interval, in kcal.
    ///
    /// Derived from the heart rate rather than picked independently, so the
    /// two figures the phone receives tell the same story. The divisor puts a
    /// 148 bpm effort near 9 kcal/min, roughly an adult's hard strength work.
    static func energyDelta(bpm: Double, over interval: TimeInterval) -> Double {
        max(0, (bpm - 60) / 600) * interval
    }
}
#endif
