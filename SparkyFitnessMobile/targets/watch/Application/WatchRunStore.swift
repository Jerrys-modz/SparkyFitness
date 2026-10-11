import Foundation
import Combine
import WatchKit

/// The wrist-only walk or run, indoors or out: what to show, and the start, pause,
/// resume and finish actions. See `WatchRunHealthKitController` for how it is
/// recorded and handed to the phone (a queued message that files it in the diary).
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
        let place: WatchRunPlace
        let elapsed: TimeInterval
        let metrics: WatchRunMetrics
        let saved: Bool
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var kind: WatchRunKind = .run
    @Published private(set) var place: WatchRunPlace = .indoor
    @Published private(set) var metrics = WatchRunMetrics()
    @Published private(set) var summary: Summary?
    /// True while paused by the movement detector rather than by the wearer.
    @Published private(set) var autoPaused = false

    /// True from Start until the summary is dismissed, so the page stays put
    /// and the wearer is not swiped away from a running recording.
    var isActive: Bool { phase != .idle }

    /// Only one workout session can run on the watch, so this refuses to
    /// start while a strength workout or the phone's GPS recording has one.
    var canStart: Bool {
        phase == .idle
            && !recoveryPending
            && !WorkoutSessionStore.shared.isActive
            && !RecordingStore.shared.isActive
            && !WorkoutHealthKitController.shared.hasLiveSession
            && !RecordingHealthKitController.shared.hasLiveSession
    }

    private let healthKit = WatchRunHealthKitController.shared

    /// A run left going by a killed app is still to be picked up at launch;
    /// starting a new one before that would collide with its Health session.
    private var recoveryPending = WatchRunSnapshotStore.exists

    private init() {
        healthKit.onMetrics = { [weak self] metrics in
            Task { @MainActor in self?.metrics = metrics }
        }
        healthKit.onFailure = { [weak self] result in
            Task { @MainActor in self?.sessionFailed(result) }
        }
        healthKit.onAutoPause = { [weak self] action in
            Task { @MainActor in self?.applyAutoPause(action) }
        }
    }

    /// Seconds on the clock. Read every second by the page; the builder keeps
    /// the count, so it stays right across pauses.
    var elapsed: TimeInterval { healthKit.elapsed }

    func start(_ kind: WatchRunKind, place: WatchRunPlace) {
        guard canStart else { return }
        self.kind = kind
        self.place = place
        summary = nil
        metrics = WatchRunMetrics()
        phase = .running
        healthKit.requestAuthorization { [weak self] in
            Task { @MainActor in
                guard let self, self.phase == .running else { return }
                if !self.healthKit.start(kind, place: place) { self.phase = .idle }
            }
        }
    }

    /// Picks a run back up after the watch app was killed while it was going.
    /// `completion(true)` means this store now holds the Health session (or
    /// has handled a run that could not be re-attached), so nothing else
    /// should treat a leftover session as its own.
    func recoverIfNeeded(completion: @escaping (Bool) -> Void) {
        guard phase == .idle else { completion(true); return }
        healthKit.recoverIfNeeded { [weak self] outcome in
            Task { @MainActor in
                guard let self else { completion(false); return }
                self.recoveryPending = false
                switch outcome {
                case .none:
                    completion(false)
                case .resumed(let recovery):
                    self.kind = recovery.kind
                    self.place = recovery.place
                    self.metrics = recovery.metrics
                    self.summary = nil
                    self.autoPaused = recovery.autoPaused
                    self.phase = recovery.paused ? .paused : .running
                    completion(true)
                case .salvaged(let result):
                    // The Health session was lost; the run itself was not.
                    WatchSessionManager.shared.sendRunFinished(result)
                    WatchRunSnapshotStore.clear()
                    self.kind = result.kind
                    self.place = result.place
                    self.metrics = result.metrics
                    self.summary = Summary(
                        kind: result.kind,
                        place: result.place,
                        elapsed: result.activeSeconds,
                        metrics: result.metrics,
                        saved: true
                    )
                    self.phase = .finished
                    completion(false)
                }
            }
        }
    }

    func pause() {
        guard phase == .running else { return }
        phase = .paused
        autoPaused = false
        healthKit.pause()
    }

    func resume() {
        guard phase == .paused else { return }
        phase = .running
        autoPaused = false
        healthKit.resume()
    }

    private func applyAutoPause(_ action: WatchAutoPause.Action) {
        switch action {
        case .pause:
            guard phase == .running else { return }
            phase = .paused
            autoPaused = true
            healthKit.pause(automatic: true)
            WKInterfaceDevice.current().play(.stop)
        case .resume:
            guard phase == .paused, autoPaused else { return }
            phase = .running
            autoPaused = false
            healthKit.resume()
            WKInterfaceDevice.current().play(.start)
        case .none:
            break
        }
    }

    /// Ends the recording and saves it to Apple Health.
    func finish() { end(save: true) }

    /// Ends the recording and writes nothing to Apple Health.
    func discard() { end(save: false) }

    func dismissSummary() {
        autoPaused = false
        summary = nil
        phase = .idle
    }

    private func end(save: Bool) {
        guard phase == .running || phase == .paused else { return }
        // Finish tapped while the Health prompts were still up: nothing was
        // ever recorded, so there is nothing to save.
        guard healthKit.hasLiveSession else {
            autoPaused = false
            phase = .idle
            return
        }
        let ending = kind
        let endingPlace = place
        autoPaused = false
        healthKit.end(save: save) { [weak self] metrics, elapsed, result in
            Task { @MainActor in
                guard let self else { return }
                self.metrics = metrics
                // The Health workout is stamped so the phone's import skips
                // it; this message is how the run reaches the diary.
                if let result { WatchSessionManager.shared.sendRunFinished(result) }
                // Only now that the phone's message is queued is the snapshot
                // no longer needed.
                WatchRunSnapshotStore.clear()
                if save {
                    self.summary = Summary(kind: ending, place: endingPlace, elapsed: elapsed, metrics: metrics, saved: true)
                    self.phase = .finished
                } else {
                    self.phase = .idle
                }
            }
        }
    }

    private func sessionFailed(_ result: WatchRunResult?) {
        guard phase == .running || phase == .paused else { return }
        autoPaused = false
        guard let result else {
            phase = .idle
            return
        }
        // The Health session failed, but the run was recorded: send it on.
        WatchSessionManager.shared.sendRunFinished(result)
        WatchRunSnapshotStore.clear()
        metrics = result.metrics
        summary = Summary(
            kind: result.kind,
            place: result.place,
            elapsed: result.activeSeconds,
            metrics: result.metrics,
            saved: true
        )
        phase = .finished
    }
}
