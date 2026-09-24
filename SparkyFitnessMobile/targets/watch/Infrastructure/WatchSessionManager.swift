import Foundation
import WatchConnectivity
import Combine

/// Watch-side WatchConnectivity wrapper: session lifecycle, the outbound
/// sends, and routing whatever arrives.
///
/// Deliberately does NOT know any wire keys. Inbound dictionaries are turned
/// into domain values by `ContextPayloadMapper`, outbound ones are built by
/// `OutboundPayloads`, and the complications are fed through
/// `ComplicationPublisher`. What's left here is the part that genuinely needs
/// `WCSession`, which is why this file went from four jobs to one.
///
/// Deliberately prefers `transferUserInfo` over `sendMessage` for check-ins:
/// the phone is realistically in another room, `sendMessage` fails outright when
/// unreachable, and a queued transfer is delivered by the system later. Losing a
/// morning's weight because the phone was charging in the bedroom would defeat
/// the whole point of the app.
@MainActor
final class WatchSessionManager: NSObject, ObservableObject {
    static let shared = WatchSessionManager()

    @Published private(set) var isReachable: Bool = false

    private let store = CheckInStore.shared
    private let workoutStore = WorkoutSessionStore.shared
    private let workoutHealthKit = WorkoutHealthKitController.shared
    /// Reads back the instants `WorkoutHealthKitController` formats with its
    /// own default `ISO8601DateFormatter`, to record how far HR was sent.
    private let instantParser = ISO8601DateFormatter()
    /// Cumulative active energy already reported to the phone, so each batch
    /// can carry only what was burned since the last one. Reset whenever a
    /// workout starts — `WorkoutSessionStore.activeEnergyKcal` restarts from
    /// nothing too, and a stale high-water mark would swallow the first
    /// batches of the new workout.
    private var reportedEnergyKcal: Double = 0

    /// True while a queued context request is still waiting to be answered.
    ///
    /// `transferUserInfo` queues rather than drops, so without this every
    /// phone-free glance at the watch would leave another request behind, and
    /// the phone would answer the lot in one burst the next time it woke.
    private var hasQueuedContextRequest = false

    private override init() {
        super.init()
        activate()
    }

    private func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    /// Sends made before `WCSession` finished activating.
    ///
    /// `activate()` returns immediately and the session only becomes usable
    /// when the delegate callback lands, so there is a window at launch where
    /// `transferUserInfo` is a programmer error rather than a queued send —
    /// WatchConnectivity raises instead of holding it. The window is short but
    /// it is exactly the one a complication tap lands in: the app cold-starts
    /// straight onto the Water page and a square is one tap away.
    ///
    /// In memory rather than persisted, deliberately. Activation completes
    /// moments after launch, and a tap lost with the process is reconciled
    /// anyway: the optimistic bump in `CheckInStore.pendingWaterTaps` clears
    /// on the next context push carrying today's water, so the bottle settles
    /// back to the truth rather than lying indefinitely.
    private var deferredTransfers: [[String: Any]] = []

    private var isActivated: Bool {
        WCSession.isSupported() && WCSession.default.activationState == .activated
    }

    /// The single door every queued send goes through.
    ///
    /// Water taps and deletes need the deferral: neither has an ack path or a
    /// replayable backing list, so dropping one silently is indistinguishable
    /// to the wearer from the app being broken. Check-ins would survive
    /// without it — they sit in `CheckInStore.pending` until `retryPending()`
    /// — but routing them through here too keeps one rule instead of two.
    private func transfer(_ payload: [String: Any]) {
        guard WCSession.isSupported() else { return }
        guard isActivated else {
            deferredTransfers.append(payload)
            return
        }
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(payload, replyHandler: nil) { _ in
                WCSession.default.transferUserInfo(payload)
            }
        } else {
            WCSession.default.transferUserInfo(payload)
        }
    }

    private func flushDeferredTransfers() {
        guard isActivated, !deferredTransfers.isEmpty else { return }
        let queued = deferredTransfers
        deferredTransfers.removeAll()
        for payload in queued {
            transfer(payload)
        }
    }

    /// Hands a check-in to the system for delivery. Returns the state to show:
    /// `.queued` always, because even a reachable phone hasn't written to the
    /// server yet — the ack flips it to `.saved`.
    func send(_ checkIn: CheckIn) -> SyncState {
        guard WCSession.isSupported() else { return .failed }
        transfer(OutboundPayloads.checkIn(checkIn))
        // Still `.queued` even when the transfer was deferred: the check-in is
        // in `CheckInStore.pending` either way, and the ack is the only thing
        // that moves it to `.saved`.
        return .queued
    }

    /// Re-queues everything still unconfirmed. Used by the retry affordance and
    /// on app launch, since a transfer can be lost if the app was force-quit.
    func retryPending() {
        // Skipped rather than deferred while activating: the activation
        // callback calls this itself, so deferring here would queue every
        // pending check-in twice.
        guard isActivated else { return }
        for checkIn in store.retryable {
            transfer(OutboundPayloads.checkIn(checkIn))
        }
    }

    /// Logs one full serving of `containerId` against today, straight to the
    /// server — there is no local-only increment. Uses the same queued
    /// delivery as a check-in (`send(_:)`) and for the same reason: the
    /// wearer is realistically drinking from wherever the phone isn't.
    ///
    /// Acknowledged like a check-in: the phone reports each tap by `clientId`,
    /// immediately when reachable and again in every context push, so the
    /// Water page can show the tap as queued, then saved, then failed. It used
    /// to be fire-and-forget, which meant a tap that never landed looked
    /// exactly like one that did.
    /// `clientId` comes from `CheckInStore.recordWaterTap` rather than being
    /// generated here: the store's copy of the tap and the phone's
    /// acknowledgement have to be talking about the same id, and two `UUID()`
    /// calls never are.
    func sendWaterTap(containerId: Int, clientId: String) {
        guard WCSession.isSupported() else { return }
        let tap = WaterTap(
            id: clientId,
            entryDate: CheckInDate.today(),
            containerId: containerId
        )
        transfer(OutboundPayloads.waterTap(tap))
    }

    /// Re-sends every tap the phone reported as failed, under its original id.
    /// Reusing the id is what keeps a retry from double-counting if the first
    /// attempt actually landed — the phone's own dedupe set recognises it.
    func retryFailedWaterTaps() {
        for tap in store.retryableWaterTaps {
            store.markWaterTap(tap.id, .queued)
            sendWaterTap(containerId: tap.containerId, clientId: tap.id)
        }
    }

    /// Asks the phone to delete one logged drink. Same fire-and-reconcile
    /// contract as `sendWaterTap`: no ack comes back, the water log view has
    /// already hidden the row, and the next context push either confirms that
    /// (row gone) or restores it (delete failed).
    func sendWaterDelete(entryId: String) {
        guard WCSession.isSupported() else { return }
        let request = WaterDeleteRequest(id: UUID().uuidString, entryId: entryId)
        transfer(OutboundPayloads.waterDelete(request))
    }

    /// Re-publishes both complications' shared-storage snapshots from the
    /// context the watch already holds.
    ///
    /// Without this, a complication's data depended entirely on a *fresh*
    /// context arriving from the phone, because `handle(context:)` was the
    /// only thing that ever wrote to the App Group. The app's own pages don't
    /// have that dependency — `CheckInStore` persists the context and
    /// restores it at launch — so the Water page could sit there reading 40%
    /// from disk while the complication showed 0%, having never been written
    /// at all. That happens on any launch where the phone app isn't in the
    /// foreground: `requestContext()` bails on `isReachable` and no push
    /// comes.
    ///
    /// Stale contexts are skipped rather than republished: the publisher
    /// stamps every snapshot with today's date, so writing yesterday's numbers
    /// would relabel them as today's. Leaving the old snapshot in place lets
    /// the widgets' own date checks fall back to empty, which is the honest
    /// answer.
    ///
    /// This is the one path that feeds the complications from the store rather
    /// than from a payload — see `handle(context:)` for the normal one.
    func refreshComplications() {
        let context = store.context

        // The `isToday` checks are now belt to the publisher's braces — it
        // rejects a non-today `day` itself. Kept because they also skip the
        // pointless work of building a snapshot that would be discarded.
        if let nutrition = context.nutrition, nutrition.isToday {
            ComplicationPublisher.publish(
                goals: GoalProgress(
                    calories: nutrition.calorieProgress,
                    protein: nutrition.protein.progress,
                    carbs: nutrition.carbs.progress,
                    fat: nutrition.fat.progress
                ),
                for: nutrition.day
            )
        }

        if let water = context.water, water.isToday {
            ComplicationPublisher.publish(
                waterProgress: context.waterProgress(ml: water.consumedMl) ?? 0,
                for: water.day
            )
        }
    }

    /// Adopts the application context WatchConnectivity is already holding.
    ///
    /// `didReceiveApplicationContext` fires only for *new* updates, so the
    /// most recent context the phone set — sitting in
    /// `receivedApplicationContext` the whole time — was never read. That
    /// left a gap with no way out of it: a fresh install (every rebuild from
    /// Xcode is one) starts with empty storage, the phone has nothing new to
    /// say so says nothing, and opening the phone app re-pushes a dictionary
    /// identical to the one already set, which the system declines to
    /// redeliver. The watch would sit there with no containers indefinitely
    /// while the data it needed was one property access away.
    ///
    /// Safe to call repeatedly: it routes through the same handler a live
    /// push does, and an unchanged context simply re-applies the same values.
    func adoptReceivedContext() {
        guard WCSession.isSupported() else { return }
        let received = WCSession.default.receivedApplicationContext
        guard !received.isEmpty else { return }
        route(received)
    }

    /// Asks the phone for a fresh context (seed values + history).
    ///
    /// Two transports, because the interesting case is the one where the phone
    /// isn't there: `sendMessage` reaches a phone whose app is running right
    /// now and fails outright otherwise, so on its own it made every glance
    /// with the phone in another room a silent no-op. `transferUserInfo`
    /// queues instead, and the system delivers it whenever the phone next
    /// wakes — the same guarantee check-ins already rely on.
    ///
    /// At most one queued request is outstanding: the phone's answer clears the
    /// flag in `handle(context:)`.
    func requestContext() {
        guard WCSession.isSupported() else { return }

        if WCSession.default.isReachable {
            WCSession.default.sendMessage(
                OutboundPayloads.contextRequest,
                replyHandler: nil,
                errorHandler: nil
            )
            return
        }

        guard !hasQueuedContextRequest else { return }
        hasQueuedContextRequest = true
        transfer(OutboundPayloads.contextRequest)
    }

    /// Applies an inbound context: into the app's own store, and — separately
    /// — out to the complications.
    ///
    /// The two sinks are siblings fed from the same payload, not a chain. The
    /// complication runs in another process and cannot read this app's
    /// storage, so the numbers genuinely go out twice. That independence is
    /// also why they can disagree, which is what `refreshComplications()`
    /// above exists to repair.
    private func handle(context payload: [String: Any]) {
        // Whatever this is a reply to, the phone has now spoken — so a fresh
        // queued request is allowed again.
        hasQueuedContextRequest = false

        let incoming = ContextPayloadMapper.context(from: payload, previous: store.context)
        store.apply(context: incoming)

        // The day this payload is ABOUT — not necessarily today. Anything
        // routed through here may be a replay of the cached context by
        // `adoptReceivedContext()`, which on the first launch of a morning is
        // still yesterday's. Passing the day is what lets the publisher tell
        // a genuinely fresh push from a rerun of an old one.
        let day = ContextPayloadMapper.day(from: payload)

        // Skipped, not published as zeros, when the phone couldn't vouch for
        // today's numbers. Whatever snapshot is already in shared storage stays
        // — and the widget's own date check turns a stale one into an empty
        // face, which is the honest answer.
        if let goals = ContextPayloadMapper.goalProgress(from: payload) {
            ComplicationPublisher.publish(goals: goals, for: day)
        }
        // Derived from the parsed snapshot rather than a dedicated payload
        // field: the two water figures already travel for the Water page's
        // bottle, and a third field carrying their ratio would be a second
        // version of the same truth to keep in step.
        if let water = incoming.water {
            ComplicationPublisher.publish(
                waterProgress: incoming.waterProgress(ml: water.consumedMl) ?? 0,
                for: day
            )
        }
    }

    /// Marks one check-in saved or failed once the phone reports the server
    /// write. Ignores an ack for a check-in this watch no longer tracks — a
    /// re-delivered transfer for something already reconciled.
    private func handle(ack payload: [String: Any]) {
        guard let ack = ContextPayloadMapper.ack(from: payload) else { return }

        // Check-ins and water taps draw their client ids from the same UUID
        // space, so one ack message serves both — whichever recognises the id
        // acts on it, and neither can mistake the other's.
        if let checkIn = store.retryable.first(where: { $0.id == ack.clientId })
            ?? (store.lastCaptured?.id == ack.clientId ? store.lastCaptured : nil) {
            store.markState(ack.ok ? .saved : .failed, for: checkIn)
            return
        }
        store.markWaterTap(ack.clientId, ack.ok ? .saved : .failed)
    }

    /// The single entry point for everything inbound, whichever transport
    /// delivered it — a live push, a queued message, or the locally cached
    /// context read by `adoptReceivedContext()`.
    private func route(_ payload: [String: Any]) {
        switch ContextPayloadMapper.type(of: payload) {
        case "context": handle(context: payload)
        case "ack": handle(ack: payload)
        case "workoutStart": handle(workoutStart: payload)
        case "workoutStop": handle(workoutStopFromPhone: payload)
        default: break
        }
    }

    // MARK: - Workout

    /// Starts (or restarts, superseding whatever was running) the workout the
    /// phone just armed the watch with. Requests HealthKit authorization every
    /// time rather than caching the result: the wearer can grant or revoke it
    /// from Settings between workouts, and a stale "already granted" would
    /// silently run with no heart rate.
    private func handle(workoutStart payload: [String: Any]) {
        guard let plan = ContextPayloadMapper.workoutPlan(from: payload) else { return }
        // A redelivered `workoutStart` for the session already running must
        // not stop HealthKit and restart the plan from set 1.
        if workoutStore.plan?.sessionId == plan.sessionId { return }

        // Finish the previous workout's HealthKit session before arming the
        // next one, and send whatever it writes at the end. The plan stays
        // in place until that batch is tagged with the old session.
        let previous = workoutStore.closeCurrentExerciseWindow()
        workoutHealthKit.stop { [weak self] samples in
            Task { @MainActor in
                guard let self else { return }
                if let previous {
                    self.sendHeartRateBatch(
                        samples,
                        exerciseEntryId: previous.id,
                        durationMinutes: previous.minutes
                    )
                }
                self.workoutStore.start(with: plan)
                self.reportedEnergyKcal = 0
                self.bindHealthKitCallbacks()
                self.workoutHealthKit.requestAuthorization { [weak self] _ in
                    self?.workoutHealthKit.start(sessionId: plan.sessionId)
                }
            }
        }
    }

    /// The HealthKit controller outlives a jetsam'd SwiftUI tree; the
    /// closures do not. Rebind after recover so samples keep flowing.
    private func bindHealthKitCallbacks() {
        // Neither closure runs on the main actor by virtue of running on the
        // main thread — `WorkoutHealthKitController` dispatches them there,
        // but that alone doesn't satisfy Swift's isolation checking for the
        // `@MainActor` types on the other end, so each hops explicitly, the
        // same pattern `WCSessionDelegate`'s callbacks use above.
        workoutHealthKit.onHeartRate = { [weak workoutStore] bpm in
            Task { @MainActor in
                workoutStore?.recordHeartRate(bpm: bpm)
            }
        }
        workoutHealthKit.onBatchReady = { [weak self] samples in
            Task { @MainActor in
                self?.sendHeartRateBatchForCurrentExercise(samples)
            }
        }
        workoutHealthKit.onActiveEnergy = { [weak workoutStore] kcal in
            Task { @MainActor in
                workoutStore?.recordActiveEnergy(kcal: kcal)
            }
        }
        // Close out the exercise being left before the cursor moves, so its
        // readings and energy are not credited to whatever comes next when
        // the minute timer (or the final drain) fires. Both sides are main
        // actor, so this runs synchronously ahead of the move.
        workoutStore.onExerciseWillChange = { [weak self] outgoingExerciseEntryId in
            guard let self else { return }
            let minutes = self.workoutStore.closeExerciseWindow(outgoingExerciseEntryId)
            self.sendHeartRateBatch(
                self.workoutHealthKit.drainPending(),
                exerciseEntryId: outgoingExerciseEntryId,
                durationMinutes: minutes
            )
        }
    }

    /// Picks an HKWorkoutSession back up after jetsam, or starts a fresh one
    /// against the persisted plan if the system let the recovered session go.
    private func recoverLiveWorkoutIfNeeded() {
        // A queued `workoutStart` can land before activationDidCompleteWith.
        // That is a live arm from the phone, newer than any snapshot, and
        // restoring over it would resurrect the previous session on top.
        if workoutStore.plan != nil { return }
        guard let snapshot = workoutStore.restoreSnapshot() else {
            // A recovered HK session with no plan is a ghost — end it so
            // Fitness does not keep a workout we can no longer attribute.
            workoutHealthKit.recoverIfNeeded { [weak self] recovered in
                if recovered {
                    self?.workoutHealthKit.stop { _ in }
                }
            }
            return
        }
        reportedEnergyKcal = snapshot.reportedEnergyKcal
        bindHealthKitCallbacks()
        workoutHealthKit.recoverIfNeeded(
            heartRateSentThrough: snapshot.heartRateSentThrough
        ) { [weak self] recovered in
            guard let self else { return }
            if recovered { return }
            self.workoutHealthKit.requestAuthorization { _ in
                self.workoutHealthKit.start(sessionId: snapshot.plan.sessionId)
            }
        }
    }

    /// The wearer finished the workout on the PHONE. Tears down the same way
    /// `endWorkout` does but sends nothing back — the phone is the one that
    /// told us, and it flushes its own heart-rate buffer when it ends a
    /// session, so echoing `workoutStop` at it would be a second flush of an
    /// already-emptied buffer.
    ///
    /// Ignores a stop naming a session we are not running: a queued transfer
    /// can arrive after the next workout has already started, and tearing
    /// that one down would look like the watch dropping a live workout.
    private func handle(workoutStopFromPhone payload: [String: Any]) {
        guard
            let sessionId = ContextPayloadMapper.workoutStopSessionId(from: payload),
            workoutStore.plan?.sessionId == sessionId
        else { return }
        finishCollection(sendStop: false)
    }

    /// Sends one completed set, carrying whatever the wearer typed. Queued
    /// like a check-in — a hole in the diary from a dropped delivery is not an
    /// acceptable loss, unlike a stretch of missing heart rate.
    func sendSetCompleted(_ step: WorkoutStep, values: SetValues) {
        guard let sessionId = workoutStore.plan?.sessionId else { return }
        let completed = CompletedSet(
            clientId: UUID().uuidString,
            sessionId: sessionId,
            setId: step.plannedSet.setId,
            weightKg: values.weightKg,
            reps: values.reps
        )
        transfer(OutboundPayloads.setCompleted(completed))
    }

    /// Sends one heart-rate batch for whichever exercise is current right now.
    ///
    /// Queued like a completed set, NOT reachability-gated. A phone in a gym
    /// bag two rooms away is the normal case, not the exception, and dropping
    /// batches whenever it drifts out of range loses exactly the data this
    /// feature exists to capture. The flush interval is a minute
    /// (`WorkoutHealthKitController.batchInterval`) to keep the queue sane.
    ///
    /// Tagged with the exercise on screen, which is right because every
    /// exercise change already sent what came before it
    /// (`onExerciseWillChange`) — whatever is buffered now was measured during
    /// the current exercise.
    private func sendHeartRateBatchForCurrentExercise(
        _ samples: [HeartRateSample],
        durationMinutes: Double? = nil
    ) {
        // After the last set, `currentStep` is nil so the UI can show
        // complete. The final drain still belongs to that last exercise.
        let exerciseEntryId =
            workoutStore.currentStep?.exerciseEntryId
            ?? workoutStore.steps.last?.exerciseEntryId
        guard let exerciseEntryId else { return }
        sendHeartRateBatch(
            samples,
            exerciseEntryId: exerciseEntryId,
            durationMinutes: durationMinutes
        )
    }

    private func sendHeartRateBatch(
        _ samples: [HeartRateSample],
        exerciseEntryId: String,
        durationMinutes: Double? = nil
    ) {
        guard let sessionId = workoutStore.plan?.sessionId else { return }
        // `max(0, ...)` because the running total should only ever climb, but
        // a HealthKit session that restarts mid-workout would reset it, and a
        // negative delta would subtract calories the wearer really burned.
        // Nil until HealthKit has delivered a reading, so a first HR batch
        // does not post a fake measured zero before any energy exists.
        let energyDelta: Double?
        if let cumulative = workoutStore.activeEnergyKcal {
            energyDelta = max(0, cumulative - reportedEnergyKcal)
            reportedEnergyKcal = cumulative
        } else {
            energyDelta = nil
        }
        // The one place that can see both halves of a batch, and so the only
        // place that can tell an empty one from an energy-only one. Callers
        // hand over whatever the buffer held, including nothing.
        guard !samples.isEmpty || (energyDelta ?? 0) > 0 || (durationMinutes ?? 0) > 0 else {
            return
        }
        workoutStore.persistSnapshot(
            reportedEnergyKcal: reportedEnergyKcal,
            heartRateSentThrough: samples.compactMap { instantParser.date(from: $0.t) }.max()
        )
        let batch = HeartRateBatch(
            clientId: UUID().uuidString,
            sessionId: sessionId,
            exerciseEntryId: exerciseEntryId,
            samples: samples,
            activeEnergyKcal: energyDelta,
            durationMinutes: (durationMinutes ?? 0) > 0 ? durationMinutes : nil
        )
        transfer(OutboundPayloads.heartRateBatch(batch))
    }

    /// Ends the workout. The stop signal waits until HealthKit has finished
    /// the workout and the tail has been queued. See `finishCollection`.
    func endWorkout() {
        // The last batch has to be queued BEFORE the stop signal, because
        // the phone flushes the moment that signal lands and transfers arrive
        // in queue order. HealthKit writes the tail inside `finishWorkout`,
        // so the stop waits until that read comes back. Reset waits with it:
        // the batch still needs the plan's session id.
        finishCollection(sendStop: true)
    }

    /// Stops HealthKit, sends the tail and the exercise's wall-clock duration,
    /// then clears local state. `sendStop` is false when the phone already
    /// ended the workout and is only waiting on the watch's last samples.
    private func finishCollection(sendStop: Bool) {
        let closing = workoutStore.closeCurrentExerciseWindow()
        workoutHealthKit.stop { [weak self] samples in
            Task { @MainActor in
                guard let self else { return }
                if let closing {
                    self.sendHeartRateBatch(
                        samples,
                        exerciseEntryId: closing.id,
                        durationMinutes: closing.minutes
                    )
                }
                if sendStop, let sessionId = self.workoutStore.plan?.sessionId {
                    self.transfer(
                        OutboundPayloads.workoutStop(WorkoutStopSignal(sessionId: sessionId))
                    )
                }
                self.workoutStore.reset()
            }
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchSessionManager: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        let reachable = session.isReachable
        Task { @MainActor in
            self.isReachable = reachable
            // First: anything the wearer did before the session was usable.
            self.flushDeferredTransfers()
            // Before asking the phone for anything: whatever it last sent is
            // already available locally, and unlike `requestContext()` this
            // works with the phone nowhere in sight.
            self.adoptReceivedContext()
            self.retryPending()
            self.recoverLiveWorkoutIfNeeded()
            self.requestContext()
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in
            self.isReachable = reachable
            if reachable {
                self.retryPending()
                self.requestContext()
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in self.route(message) }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        Task { @MainActor in self.route(message) }
        replyHandler([:])
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task { @MainActor in self.route(userInfo) }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        Task { @MainActor in self.route(applicationContext) }
    }
}
