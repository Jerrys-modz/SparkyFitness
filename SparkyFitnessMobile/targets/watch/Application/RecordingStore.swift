import Foundation
import Combine

/// The watch's view of a GPS recording the phone is making: what to show, and
/// the pause/resume/finish and heart-rate messages going back.
///
/// The phone is the source of truth. This only mirrors its last message; the
/// clock runs locally between updates (`RecordingState.elapsed`).
@MainActor
final class RecordingStore: ObservableObject {
    static let shared = RecordingStore()

    @Published private(set) var state: RecordingState?

    /// The newest heart rate, shown beside the status while readings keep
    /// arriving. Cleared when they stop for `liveHeartRateMaxAge`, and
    /// whenever the recording is not running, so a stale number never sits on
    /// the page.
    @Published private(set) var liveHeartRate: Int?
    private var staleReadingTask: Task<Void, Never>?
    private static let liveHeartRateMaxAge: TimeInterval = 15

    /// True while there is a recording to show, including a finished one the
    /// phone has not saved yet.
    var isActive: Bool { state != nil }

    private let healthKit = RecordingHealthKitController.shared
    /// Recordings the phone has ended. A queued state message for one of them
    /// can arrive late and must not bring it back.
    private var endedSessionIds: [String] = []
    /// The recording heart rate is being collected for.
    private var collectingFor: String?

    private init() {
        healthKit.onBatchReady = { [weak self] samples in
            Task { @MainActor in self?.sendHeartRate(samples) }
        }
        healthKit.onLiveReading = { [weak self] bpm, at in
            Task { @MainActor in self?.receiveLiveHeartRate(bpm, at: at) }
        }
    }

    func apply(_ update: RecordingUpdate) {
        switch update {
        case .ended(let sessionId, _):
            remember(ended: sessionId)
            guard state?.sessionId == sessionId else { return }
            // A recording that is still collecting when the phone ends it was
            // discarded; one that finished first is already saved.
            finishCollection(discard: true)
            clearLiveHeartRate()
            state = nil
        case .state(let incoming):
            if endedSessionIds.contains(incoming.sessionId) { return }
            if let current = state, current.sessionId == incoming.sessionId {
                // Out of order: a queued copy of an earlier status.
                if incoming.sentAt < current.sentAt { return }
            }
            let previous = state
            state = incoming
            if incoming.status != .recording { clearLiveHeartRate() }
            updateCollection(previous: previous, current: incoming)
        }
    }

    // MARK: - Controls

    func pause() { sendControl("pause") }
    func resume() { sendControl("resume") }
    func finish() { sendControl("finish") }

    private func sendControl(_ action: String) {
        guard let state else { return }
        WatchSessionManager.shared.sendRecordingControl(sessionId: state.sessionId, action: action)
    }

    // MARK: - Heart rate

    private func updateCollection(previous: RecordingState?, current: RecordingState) {
        switch current.status {
        case .recording:
            if collectingFor != current.sessionId {
                // A strength workout owns the HealthKit session; the
                // recording then runs without heart rate.
                guard !WorkoutSessionStore.shared.isActive else { return }
                collectingFor = current.sessionId
                WorkoutHealthKitController.shared.requestAuthorization { [weak self] _ in
                    Task { @MainActor in
                        // The recording may have finished while the prompt was up.
                        guard let self, self.state?.sessionId == current.sessionId,
                              self.state?.status != .finished else { return }
                        self.healthKit.start(sessionId: current.sessionId, activity: current.activity)
                    }
                }
            } else if previous?.status == .paused {
                healthKit.resume()
            }
        case .paused:
            if collectingFor == current.sessionId { healthKit.pause() }
        case .finished:
            if collectingFor == current.sessionId { finishCollection(discard: false) }
        case .ended:
            break
        }
    }

    /// Shows the reading on the wrist and tells the phone, which shows it on
    /// its recording screen. The phone copy is a live message only (see
    /// `WatchSessionManager.sendRecordingLiveHeartRate`); the batches are what
    /// reach the diary.
    private func receiveLiveHeartRate(_ bpm: Double, at date: Date) {
        guard let state, state.status == .recording,
              collectingFor == state.sessionId, bpm > 0
        else { return }
        liveHeartRate = Int(bpm.rounded())
        staleReadingTask?.cancel()
        staleReadingTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.liveHeartRateMaxAge * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.liveHeartRate = nil
        }
        WatchSessionManager.shared.sendRecordingLiveHeartRate(
            sessionId: state.sessionId,
            bpm: bpm,
            measuredAt: date
        )
    }

    private func clearLiveHeartRate() {
        staleReadingTask?.cancel()
        staleReadingTask = nil
        liveHeartRate = nil
    }

    private func finishCollection(discard: Bool) {
        guard let sessionId = collectingFor else { return }
        collectingFor = nil
        healthKit.stop(discard: discard) { [weak self] samples in
            Task { @MainActor in self?.sendHeartRate(samples, sessionId: sessionId) }
        }
    }

    private func sendHeartRate(_ samples: [HeartRateSample], sessionId: String? = nil) {
        guard !samples.isEmpty, let id = sessionId ?? collectingFor ?? state?.sessionId else { return }
        WatchSessionManager.shared.sendRecordingHeartRate(
            sessionId: id,
            clientId: UUID().uuidString,
            samples: samples
        )
    }

    private func remember(ended sessionId: String) {
        endedSessionIds.append(sessionId)
        if endedSessionIds.count > 10 { endedSessionIds.removeFirst() }
    }
}
