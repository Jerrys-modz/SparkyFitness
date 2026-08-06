import SwiftUI

/// Hevy-style single-set-at-a-time workout screen. The watch only ever shows
/// the phone's current cursor set — there's no per-exercise navigation here
/// because `activeWorkoutStore` itself doesn't expose one; sets complete in
/// whatever order the user taps them, on either device, and the cursor
/// (`activeSetId`) always comes from the phone's mirrored state.
struct ActiveWorkoutView: View {
    let workout: WatchActiveWorkoutPayload
    @EnvironmentObject private var session: WatchSessionManager

    @State private var reps: Double = 0
    @State private var weight: Double = 0
    @State private var trackedSetId: String?

    private var weightStep: Double { workout.weightUnit == "kg" ? 2.5 : 5 }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(workout.exerciseName)
                    .font(.system(size: 16, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)

                if !workout.setDots.isEmpty {
                    SetDotRow(dots: workout.setDots)
                }

                if workout.rest.state != "ready" {
                    restSection
                } else if workout.isFinished {
                    finishedSection
                } else {
                    logSetSection
                }

                Button(role: .destructive) {
                    session.send(.finishWorkout)
                } label: {
                    Label("Finish Workout", systemImage: "checkmark.seal")
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .font(.system(size: 12))
                .padding(.top, 4)
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 8)
        }
        .onAppear { syncTargetsIfNeeded() }
        .onChange(of: workout.activeSetId) { _, _ in syncTargetsIfNeeded() }
    }

    /// Reseed the editable reps/weight fields from the phone's assumed
    /// targets only when the cursor actually moves to a new set — otherwise
    /// a value the user is mid-adjusting would keep getting clobbered by
    /// every context push (context pushes on every store change, not just
    /// cursor moves).
    private func syncTargetsIfNeeded() {
        guard trackedSetId != workout.activeSetId else { return }
        trackedSetId = workout.activeSetId
        reps = Double(workout.targetReps ?? 0)
        weight = workout.targetWeight ?? 0
    }

    private var logSetSection: some View {
        VStack(spacing: 8) {
            Text("Set \(workout.setNumber) of \(workout.setCount)")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)

            NumericStepperRow(label: "Reps", value: $reps, step: 1, minValue: 0, format: { String(Int($0)) })
            NumericStepperRow(label: workout.weightUnit, value: $weight, step: weightStep, minValue: 0, format: formatTrimmedDecimal)

            Button {
                logSet()
            } label: {
                Label("Log Set", systemImage: "checkmark")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.accentColor)
        }
    }

    private var restSection: some View {
        VStack(spacing: 8) {
            ZStack {
                RestCountdownRing(durationSec: workout.rest.durationSec, endsAt: workout.rest.endsAt)
                Image(systemName: "hourglass")
                    .foregroundStyle(.secondary)
            }
            .frame(width: 64, height: 64)
            Text(workout.rest.state == "paused" ? "Rest paused" : "Resting…")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                Button("+15s") { session.send(.adjustRest(deltaSec: 15)) }
                    .buttonStyle(.bordered)
                Button("Skip") { session.send(.skipRest) }
                    .buttonStyle(.borderedProminent)
            }
            .font(.system(size: 12))
        }
    }

    private var finishedSection: some View {
        VStack(spacing: 6) {
            Image(systemName: "checkmark.circle.fill")
                .font(.title)
                .foregroundStyle(.green)
            Text("All sets complete")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }

    private func logSet() {
        guard let setId = workout.activeSetId else { return }
        session.send(.logSet(setId: setId, reps: Int(reps), weight: weight, weightUnit: workout.weightUnit))
    }
}

private struct SetDotRow: View {
    let dots: [WatchSetDot]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(dots) { dot in
                Circle()
                    .fill(color(for: dot))
                    .frame(width: 8, height: 8)
                    .overlay(
                        Circle()
                            .stroke(dot.isActive ? Color.accentColor : .clear, lineWidth: 1.5)
                            .frame(width: 13, height: 13)
                    )
            }
        }
    }

    private func color(for dot: WatchSetDot) -> Color {
        if dot.completed { return .accentColor }
        return .secondary.opacity(0.3)
    }
}

private struct NumericStepperRow: View {
    let label: String
    @Binding var value: Double
    let step: Double
    let minValue: Double
    let format: (Double) -> String

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .frame(width: 42, alignment: .leading)
            Spacer(minLength: 0)
            Button {
                value = max(minValue, value - step)
            } label: {
                Image(systemName: "minus.circle.fill")
            }
            .buttonStyle(.plain)

            Text(format(value))
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .frame(minWidth: 46)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Button {
                value += step
            } label: {
                Image(systemName: "plus.circle.fill")
            }
            .buttonStyle(.plain)
        }
    }
}

#if DEBUG
#Preview {
    ActiveWorkoutView(workout: WatchActiveWorkoutPayload(
        sessionId: "preview",
        workoutName: "Push Day",
        exerciseName: "Bench Press",
        setNumber: 2,
        setCount: 4,
        activeSetId: "set-2",
        targetReps: 8,
        targetWeight: 62.5,
        weightUnit: "kg",
        setDots: [
            WatchSetDot(id: "set-1", completed: true, isActive: false),
            WatchSetDot(id: "set-2", completed: false, isActive: true),
            WatchSetDot(id: "set-3", completed: false, isActive: false),
            WatchSetDot(id: "set-4", completed: false, isActive: false),
        ],
        rest: WatchRestState(state: "ready", durationSec: 90, endsAt: nil),
        startedAt: Date().timeIntervalSince1970 * 1000,
        isFinished: false
    ))
    .environmentObject(WatchSessionManager.shared)
}
#endif
