import Foundation

/// One set the phone expects for an exercise, as planned before the workout
/// started — target reps/weight, not what actually gets logged. The watch
/// shows these as placeholders and lets the wearer adjust before confirming,
/// the same "assumed values" pattern the phone's own active-workout screen
/// uses.
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

/// One completed set, as reported to the phone. `setId` must be one of the
/// ids `ActiveWorkoutPlan` supplied — the phone looks it up in its own
/// session rather than trusting anything else about it.
struct CompletedSet: Codable, Equatable {
    /// Generated on the watch so a queued transfer delivered twice can be
    /// recognised and ignored — same role `CheckIn.id` plays for check-ins.
    let clientId: String
    let sessionId: String
    let setId: String
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
