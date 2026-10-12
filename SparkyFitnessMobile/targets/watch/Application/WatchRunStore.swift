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
    @Published private(set) var lapCount = 0
    /// The plan this run follows, if any. The page works out the live step
    /// from it each second; the store only cues the changes.
    @Published private(set) var plan: WatchRunPlan?
    /// Index of the plan step already announced (-1 before the first).
    private var cuedStep = -1
    private var stepTimer: Timer?
    /// Whole km or miles already announced, so a split is cued once.
    private var cuedSplits = 0
    private var lastSplitElapsed: TimeInterval = 0

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
    private var recovering = false

    private init() {
        healthKit.onMetrics = { [weak self] metrics in
            Task { @MainActor in
                self?.metrics = metrics
                self?.cueSplitIfDue(metrics)
            }
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

    func start(_ kind: WatchRunKind, place: WatchRunPlace, plan: WatchRunPlan? = nil) {
        guard canStart else { return }
        self.kind = kind
        self.place = place
        self.plan = plan
        cuedStep = -1
        summary = nil
        metrics = WatchRunMetrics()
        lapCount = 0
        cuedSplits = 0
        lastSplitElapsed = 0
        phase = .running
        healthKit.requestAuthorization { [weak self] in
            Task { @MainActor in
                guard let self, self.phase == .running else { return }
                if self.healthKit.start(kind, place: place, plan: plan) {
                    self.startStepTimer()
                } else {
                    self.phase = .idle
                    self.plan = nil
                }
            }
        }
    }

    /// Picks a run back up after the watch app was killed while it was going.
    /// `completion(true)` means this store now holds the Health session (or
    /// has handled a run that could not be re-attached), so nothing else
    /// should treat a leftover session as its own.
    func recoverIfNeeded(completion: @escaping (Bool) -> Void) {
        guard phase == .idle else { completion(true); return }
        // Two overlapping calls would both reach the Health session.
        guard !recovering else { completion(true); return }
        recovering = true
        healthKit.recoverIfNeeded { [weak self] outcome in
            Task { @MainActor in
                guard let self else { completion(false); return }
                self.recoveryPending = false
                self.recovering = false
                switch outcome {
                case .none:
                    completion(false)
                case .resumed(let recovery):
                    self.kind = recovery.kind
                    self.place = recovery.place
                    self.metrics = recovery.metrics
                    self.summary = nil
                    self.autoPaused = recovery.autoPaused
                    self.lapCount = recovery.lapCount
                    self.plan = self.healthKit.plan
                    // The recovered builder may still read 0 for a moment, so the
                    // snapshot's time is the floor: the step the run is in now is
                    // not announced again.
                    let resumedAt = max(self.healthKit.elapsed, recovery.elapsed)
                    self.cuedStep = self.plan?.position(at: resumedAt)?.index ?? -1
                    self.startStepTimer()
                    // Splits passed while the app was gone are not replayed.
                    self.cuedSplits = WatchRunCues.completedSplits(
                        distanceMeters: recovery.metrics.distanceMeters,
                        usesMiles: self.usesMiles
                    )
                    self.lastSplitElapsed = resumedAt
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

    /// Marks a lap at this moment; the phone cuts the saved route there.
    func lap() {
        guard phase == .running else { return }
        if healthKit.markLap() {
            lapCount = healthKit.lapCount
            Haptics.step()
        }
    }

    private func startStepTimer() {
        stopStepTimer()
        guard plan != nil else { return }
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.cueStepIfDue() }
        }
        RunLoop.main.add(timer, forMode: .common)
        stepTimer = timer
        cueStepIfDue()
    }

    private func stopStepTimer() {
        stepTimer?.invalidate()
        stepTimer = nil
    }

    /// Announces a plan step when it begins: a tap, the words if Voice cues
    /// is on, and a lap mark so the saved run is cut at the step. Time is the
    /// builder's active clock, so a pause never eats into a step.
    private func cueStepIfDue() {
        guard phase == .running, let plan,
              let position = plan.position(at: healthKit.elapsed),
              position.index != cuedStep else { return }
        let first = cuedStep < 0
        cuedStep = position.index
        Haptics.step()
        if !first && !position.finished, healthKit.markLap(force: true) {
            lapCount = healthKit.lapCount
        }
        guard CheckInStore.shared.context.runVoiceCues == true else { return }
        if position.finished {
            WatchRunCues.shared.speak("Plan complete.", interrupt: true)
        } else {
            WatchRunCues.shared.speak(
                WatchRunCues.stepText(label: position.label, seconds: plan.steps[position.index].seconds),
                interrupt: true
            )
        }
    }

    private var usesMiles: Bool {
        CheckInStore.shared.context.distanceUnit == "miles"
    }

    /// Buzzes at each whole km or mile, and speaks it when the phone's Voice
    /// cues switch is on. Only the latest of several passed at once is spoken.
    private func cueSplitIfDue(_ metrics: WatchRunMetrics) {
        guard phase == .running else { return }
        let done = WatchRunCues.completedSplits(distanceMeters: metrics.distanceMeters, usesMiles: usesMiles)
        guard done > cuedSplits else { return }
        let passed = done - cuedSplits
        let now = healthKit.elapsed
        let perSplit = max(1, (now - lastSplitElapsed) / Double(passed))
        cuedSplits = done
        lastSplitElapsed = now
        Haptics.step()
        if CheckInStore.shared.context.runVoiceCues == true {
            WatchRunCues.shared.speak(
                WatchRunCues.splitText(number: done, seconds: perSplit, usesMiles: usesMiles)
            )
        }
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
        stopStepTimer()
        plan = nil
        lapCount = 0
        autoPaused = false
        summary = nil
        phase = .idle
    }

    private func end(save: Bool) {
        guard phase == .running || phase == .paused else { return }
        stopStepTimer()
        // Finish tapped while the Health prompts were still up: nothing was
        // ever recorded, so there is nothing to save.
        guard healthKit.hasLiveSession else {
            autoPaused = false
            plan = nil
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
                    self.plan = nil
                    self.phase = .idle
                }
            }
        }
    }

    private func sessionFailed(_ result: WatchRunResult?) {
        guard phase == .running || phase == .paused else { return }
        stopStepTimer()
        autoPaused = false
        guard let result else {
            plan = nil
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
