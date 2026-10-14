import Foundation

/// What a run's coach has already said, so a cue is never repeated. Not saved
/// with the run: after a relaunch it is rebuilt from the clock (`resumed`),
/// which counts everything already passed as said.
struct WatchCoachingState: Equatable {
    var checkIns = 0
    var warnedStep = -1
    var halfway = false
    var lastMinute = false

    /// The state for a run picked up again at `elapsed`: whatever has already
    /// passed is treated as said.
    static func resumed(at elapsed: TimeInterval, plan: WatchRunPlan?, checkInMinutes: Int) -> WatchCoachingState {
        var state = WatchCoachingState()
        if checkInMinutes > 0 {
            state.checkIns = Int(elapsed / Double(checkInMinutes * 60))
        }
        if let plan {
            let total = plan.totalSeconds
            if let position = plan.position(at: elapsed) {
                state.warnedStep = position.finished ? plan.steps.count : position.index - 1
                if !position.finished, position.remaining <= WatchCoaching.stepWarningSeconds,
                   plan.steps[position.index].seconds >= WatchCoaching.minWarnedStepSeconds {
                    state.warnedStep = position.index
                }
            }
            state.halfway = elapsed >= total / 2
            state.lastMinute = total - elapsed <= 60
        }
        return state
    }
}

enum WatchCoachingCue: Equatable {
    case stepWarning(next: String?)
    case lastMinute
    case halfway
    case checkIn(minutes: Int)
}

/// Swift port of `nextCoachingCues` in `src/utils/coachingCues.ts`; the
/// constants and the order of the cues must stay in step with it.
enum WatchCoaching {
    static let stepWarningSeconds = 10.0
    static let minWarnedStepSeconds = 30.0
    static let minHalfwayPlanSeconds = 5.0 * 60
    static let minLastMinutePlanSeconds = 3.0 * 60

    /// The cues due at `elapsed` (most important first) and the state after
    /// them. The caller speaks the first; the rest are marked said.
    static func next(
        elapsed: TimeInterval,
        plan: WatchRunPlan?,
        checkInMinutes: Int,
        state: WatchCoachingState
    ) -> (cues: [WatchCoachingCue], state: WatchCoachingState) {
        var state = state
        var cues: [WatchCoachingCue] = []

        if let plan {
            if let position = plan.position(at: elapsed), !position.finished,
               plan.steps[position.index].seconds >= minWarnedStepSeconds,
               position.remaining <= stepWarningSeconds,
               position.index > state.warnedStep {
                let next = position.index + 1 < plan.steps.count ? plan.steps[position.index + 1].label : nil
                cues.append(.stepWarning(next: next))
                state.warnedStep = position.index
            }
            let total = plan.totalSeconds
            if !state.lastMinute, total >= minLastMinutePlanSeconds, elapsed < total, total - elapsed <= 60 {
                cues.append(.lastMinute)
                state.lastMinute = true
            }
            if !state.halfway, total >= minHalfwayPlanSeconds, elapsed >= total / 2, elapsed < total {
                cues.append(.halfway)
                state.halfway = true
            }
        }

        if checkInMinutes > 0 {
            let due = Int(elapsed / Double(checkInMinutes * 60))
            if due > state.checkIns {
                cues.append(.checkIn(minutes: due * checkInMinutes))
                state.checkIns = due
            }
        }
        return (cues, state)
    }
}
