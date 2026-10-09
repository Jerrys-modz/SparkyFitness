import Foundation
import Combine

/// The wrist-only indoor walk or run: what to show, and the start, pause,
/// resume and finish actions. See `WatchRunHealthKitController` for how it is
/// recorded and handed to the phone (through Apple Health).
@MainActor
final class WatchRunStore: ObservableObject {
    static let shared = WatchRunStore()

    enum Phase: Equatable {
        case idle
        case running
        case paused
        /// Ended and saved; the summary is up until the wearer dismisses it.
        case finished
    }

    /// What a finished recording leaves for the summary page.
    struct Summary: Equatable {
        let kind: WatchRunKind
        let elapsed: TimeInterval
        let metrics: WatchRunMetrics
        let saved: Bool
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var kind: WatchRunKind = .run
    @Published private(set) var metrics = WatchRunMetrics()
    @Published private(set) var summary: Summary?

    /// True from Start until the summary is dismissed, so the page stays put
    /// and the wearer is not swiped away from a running recording.
    var isActive: Bool { phase != .idle }

    /// Only one workout session can run on the watch, so this refuses to
    /// start while a strength workout or the phone's GPS recording has one.
    var canStart: Bool {
        phase == .idle
            && !WorkoutSessionStore.shared.isActive
            && !RecordingStore.shared.isActive
            && !WorkoutHealthKitController.shared.hasLiveSession
            && !RecordingHealthKitController.shared.hasLiveSession
    }

    private let healthKit = WatchRunHealthKitController.shared

    private init() {
        healthKit.onMetrics = { [weak self] metrics in
            Task { @MainActor in self?.metrics = metrics }
        }
        healthKit.onFailure = { [weak self] in
            Task { @MainActor in self?.sessionFailed() }
        }
    }

    /// Seconds on the clock. Read every second by the page; the builder keeps
    /// the count, so it stays right across pauses.
    var elapsed: TimeInterval { healthKit.elapsed }

    func start(_ kind: WatchRunKind) {
        guard canStart else { return }
        self.kind = kind
        summary = nil
        metrics = WatchRunMetrics()
        phase = .running
        healthKit.requestAuthorization { [weak self] in
            Task { @MainActor in
                guard let self, self.phase == .running else { return }
                if !self.healthKit.start(kind) { self.phase = .idle }
            }
        }
    }

    func pause() {
        guard phase == .running else { return }
        phase = .paused
        healthKit.pause()
    }

    func resume() {
        guard phase == .paused else { return }
        phase = .running
        healthKit.resume()
    }

    /// Ends the recording and saves it to Apple Health.
    func finish() { end(save: true) }

    /// Ends the recording and writes nothing to Apple Health.
    func discard() { end(save: false) }

    func dismissSummary() {
        summary = nil
        phase = .idle
    }

    private func end(save: Bool) {
        guard phase == .running || phase == .paused else { return }
        let ending = kind
        healthKit.end(save: save) { [weak self] metrics, elapsed in
            Task { @MainActor in
                guard let self else { return }
                self.metrics = metrics
                if save {
                    self.summary = Summary(kind: ending, elapsed: elapsed, metrics: metrics, saved: true)
                    self.phase = .finished
                } else {
                    self.phase = .idle
                }
            }
        }
    }

    private func sessionFailed() {
        guard phase == .running || phase == .paused else { return }
        phase = .idle
    }
}
