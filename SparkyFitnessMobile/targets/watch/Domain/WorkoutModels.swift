import Foundation

/// One set the phone expects for an exercise, as planned before the workout
/// started — target reps/weight, not what actually gets logged. The watch
/// shows these as the starting values in its editable fields, the same
/// "assumed values" pattern the phone's own active-workout screen uses.
struct PlannedSet: Codable, Equatable, Identifiable {
    /// The server-assigned exercise_entry_sets id, stringified — this is
    /// exactly `WorkoutStep.setId` on the phone (`activeWorkoutStore.ts`), so
    /// echoing it back in `setCompleted` lets the phone call its own
    /// `completeSet(setId)` unchanged.
    let setId: String
    let targetReps: Double?
    /// Always kg, like every other weight value this app moves between watch
    /// and phone — display converts via `CheckInStore`'s `effectiveWeightUnit`.
    let targetWeightKg: Double?
    /// Rest to run after this set, in seconds — the phone's own
    /// `WorkoutStep.restSec` (activeWorkoutStore.ts), carried over verbatim so
    /// the watch's timer agrees with what the phone would have shown.
    let restSeconds: Int
    /// `normal`, `warmup`, `drop`… straight from `exercise_entry_sets.set_type`.
    /// Drives the label above the values ("Warmup 1/2" rather than "Set 1/2");
    /// nil or an unrecognised value just reads as a normal set.
    let setType: String?

    var id: String { setId }
}

/// One exercise in the started plan, with its own sets in order.
struct PlannedExercise: Codable, Equatable, Identifiable {
    /// The exercise_entries id — what a `heartRateBatch` for this exercise
    /// names, so the phone can attach the series to the right entry.
    let exerciseEntryId: String
    let name: String
    let sets: [PlannedSet]

    var id: String { exerciseEntryId }
}

/// The workout the phone armed the watch with. Sent once, in full, at the
/// start of the session — there is no partial update, only a fresh
/// `workoutStart` (a phone-side edit mid-workout is out of scope for the
/// watch, which only ever reflects what existed the moment it began).
struct ActiveWorkoutPlan: Codable, Equatable {
    /// The live-workout session id (`activeWorkoutStore.sessionId` on the
    /// phone) — every message about this workout carries it, so the phone
    /// can ignore a stale message from a session it has already cleared.
    let sessionId: String
    let workoutName: String
    let exercises: [PlannedExercise]
}

/// One set of one exercise, as a position in the workout's flat running order.
///
/// The watch shows a single set at a time and pages through them, so it walks
/// a flattened sequence rather than a list of exercises — the same shape the
/// phone's `buildStepsFromSession` produces, which is what keeps the two
/// cursors talking about the same thing.
struct WorkoutStep: Identifiable, Equatable {
    let exerciseEntryId: String
    let exerciseName: String
    let set: PlannedSet
    /// 1-based position of this set within its own exercise, and how many
    /// that exercise has — the "1/2" in "Warmup 1/2".
    let setNumber: Int
    let setCount: Int

    var id: String { set.setId }

    /// "Warmup 1/2" / "Set 2/3" — what sits under the exercise name.
    var label: String {
        let kind: String
        switch set.setType?.lowercased() {
        case "warmup": kind = "Warmup"
        case "drop": kind = "Drop"
        case "failure": kind = "Failure"
        default: kind = "Set"
        }
        return "\(kind) \(setNumber)/\(setCount)"
    }
}

/// What the wearer actually did for a set, once they have adjusted the
/// targets. Absent fields mean "unchanged from target" — the watch only
/// records an override when a value is edited.
struct SetValues: Codable, Equatable {
    var weightKg: Double?
    var reps: Double?
}

/// One completed set, as reported to the phone. `setId` must be one of the
/// ids `ActiveWorkoutPlan` supplied — the phone looks it up in its own
/// session rather than trusting anything else about it.
///
/// Carries the values too, because the watch is where they were typed: the
/// phone applies them with `updateSetField` before `completeSet`, so a set
/// logged from the wrist records what the wearer actually lifted rather than
/// the plan's guess.
struct CompletedSet: Codable, Equatable {
    /// Generated on the watch so a queued transfer delivered twice can be
    /// recognised and ignored — same role `CheckIn.id` plays for check-ins.
    let clientId: String
    let sessionId: String
    let setId: String
    let weightKg: Double?
    let reps: Double?
}

/// One heart-rate reading captured during the workout.
struct HeartRateSample: Codable, Equatable {
    /// ISO 8601 instant.
    let t: String
    let bpm: Double
}

/// A batch of heart-rate samples for one exercise, tagged with whichever
/// exercise was showing on screen when they were captured. Batched (rather
/// than one message per sample) to keep the transfer rate sane over a
/// multi-minute set; tagging by exercise here means the phone never has to
/// reconstruct per-exercise windows from timestamps alone.
struct HeartRateBatch: Codable, Equatable {
    let sessionId: String
    let exerciseEntryId: String
    let samples: [HeartRateSample]
}

/// The wearer ended the workout on the watch. Carries no data of its own —
/// per-set completions and heart rate already arrived as they happened, so
/// this is purely "stop expecting more" and the signal to flush.
struct WorkoutStopSignal: Codable, Equatable {
    let sessionId: String
}
