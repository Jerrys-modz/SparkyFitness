import SwiftUI

/// The Workout tab. Nothing here starts a workout — the phone arms it by
/// pushing `workoutStart` for a preset session already begun there — so this
/// is either a waiting placeholder or a live Hevy-style set tracker: a
/// header with elapsed time and BPM, the current exercise's sets, and a rest
/// countdown between them.
struct WorkoutView: View {
    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        Group {
            if store.isActive {
                ActiveWorkoutView()
            } else {
                WaitingForWorkoutView()
            }
        }
    }
}

private struct WaitingForWorkoutView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "figure.strengthtraining.traditional")
                .font(.title2)
                .foregroundStyle(.secondary)
            Text("Start a workout on your phone")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 8)
    }
}

private struct ActiveWorkoutView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                WorkoutHeaderView()

                if let endsAt = store.restEndsAt {
                    RestTimerView(endsAt: endsAt) { store.skipRest() }
                } else if let exercise = store.currentExercise {
                    CurrentExerciseView(exercise: exercise)
                } else {
                    Text("Workout complete")
                        .font(.headline)
                }

                ExerciseNavigationRow()

                Button(role: .destructive) {
                    session.endWorkout()
                } label: {
                    Text("Finish")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .padding(.horizontal, 4)
        }
    }
}

/// Elapsed time and live BPM — shown across every sub-screen of the active
/// workout, the same "always visible" placement Hevy's own watch app uses.
private struct WorkoutHeaderView: View {
    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        HStack {
            Text(Self.formatElapsed(store.elapsedSeconds))
                .font(.headline)
                .monospacedDigit()
            Spacer()
            if let bpm = store.latestBpm {
                Label("\(Int(bpm.rounded()))", systemImage: "heart.fill")
                    .font(.headline)
                    .foregroundStyle(.red)
                    .monospacedDigit()
            }
        }
    }

    private static func formatElapsed(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

private struct ExerciseNavigationRow: View {
    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        HStack {
            Button {
                store.goToPreviousExercise()
            } label: {
                Image(systemName: "chevron.left")
            }
            .disabled(store.currentExerciseIndex == 0)

            Spacer()

            if let plan = store.plan {
                Text("\(store.currentExerciseIndex + 1) / \(plan.exercises.count)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                store.goToNextExercise()
            } label: {
                Image(systemName: "chevron.right")
            }
            .disabled(store.isLastExercise)
        }
        .buttonStyle(.plain)
    }
}

private struct CurrentExerciseView: View {
    let exercise: PlannedExercise
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(exercise.name)
                .font(.headline)
                .lineLimit(2)

            ForEach(Array(exercise.sets.enumerated()), id: \.element.id) { index, set in
                SetRow(
                    index: index + 1,
                    set: set,
                    isCompleted: store.completedSetIds.contains(set.setId)
                ) {
                    store.markSetCompleted(set)
                    session.sendSetCompleted(set)
                }
            }
        }
    }
}

/// One target set row. Tapping logs it as-is — there is no reps/weight
/// adjustment control on this first pass, unlike the phone's active-workout
/// screen; the wearer edits the logged value on the phone afterwards if the
/// target didn't hold. `isCompleted` disables the row rather than hiding it,
/// so the wearer can still see what they just logged without scrolling.
private struct SetRow: View {
    let index: Int
    let set: PlannedSet
    let isCompleted: Bool
    let onComplete: () -> Void

    var body: some View {
        Button(action: onComplete) {
            HStack {
                Text("Set \(index)")
                    .font(.caption)
                Spacer()
                if !targetLabel.isEmpty {
                    Text(targetLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Image(systemName: isCompleted ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isCompleted ? .green : .secondary)
            }
        }
        .buttonStyle(.plain)
        .disabled(isCompleted)
    }

    private var targetLabel: String {
        switch (set.targetWeightKg, set.targetReps) {
        case let (weight?, reps?):
            return "\(Int(weight))kg × \(Int(reps))"
        case let (nil, reps?):
            return "\(Int(reps)) reps"
        case let (weight?, nil):
            return "\(Int(weight))kg"
        case (nil, nil):
            return ""
        }
    }
}

private struct RestTimerView: View {
    let endsAt: Date
    let onSkip: () -> Void

    @State private var now = Date()
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 4) {
            Text("Rest")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(remainingLabel)
                .font(.title2)
                .monospacedDigit()
            Button("Skip", action: onSkip)
                .buttonStyle(.bordered)
        }
        .onReceive(ticker) { value in now = value }
    }

    private var remainingLabel: String {
        let remaining = max(0, Int(endsAt.timeIntervalSince(now).rounded()))
        return String(format: "%d:%02d", remaining / 60, remaining % 60)
    }
}
