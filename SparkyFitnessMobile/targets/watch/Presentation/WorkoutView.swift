import SwiftUI

/// The Workout tab. Nothing here starts a workout — the phone arms it by
/// pushing `workoutStart` for a preset session already begun there.
///
/// Laid out one set at a time rather than as a list of an exercise's sets:
/// the wearer is mid-lift looking at a 40mm screen, so the two numbers they
/// might change are big enough to hit, and everything else pages out of the
/// way. `<` and `>` walk the whole workout's sets in order.
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

    var body: some View {
        VStack(spacing: 4) {
            MetricsStrip()

            if store.isResting {
                RestView()
            } else if let step = store.currentStep {
                CurrentSetView(step: step)
            } else {
                Spacer()
                Text("Workout complete")
                    .font(.headline)
                Spacer()
            }
        }
        .padding(.horizontal, 4)
    }
}

/// Calories, elapsed time and heart rate on one line, always visible. Kept
/// deliberately small: it is reference information, not the thing being
/// interacted with, and the set values below need the room.
private struct MetricsStrip: View {
    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        HStack(spacing: 6) {
            if let kcal = store.activeEnergyKcal {
                Label("\(Int(kcal))", systemImage: "flame.fill")
                    .foregroundStyle(.orange)
            }
            Text(Self.elapsed(store.elapsedSeconds))
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            if let bpm = store.latestBpm {
                Label("\(Int(bpm.rounded()))", systemImage: "heart.fill")
                    .foregroundStyle(.red)
            }
        }
        .font(.caption2)
        .monospacedDigit()
        .lineLimit(1)
    }

    private static func elapsed(_ seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        let secs = seconds % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, secs)
            : String(format: "%d:%02d", minutes, secs)
    }
}

private struct CurrentSetView: View {
    let step: WorkoutStep

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager

    /// Which field the keypad is editing, if any.
    @State private var editing: EditableField?

    private enum EditableField: Identifiable {
        case weight, reps
        var id: Int { self == .weight ? 0 : 1 }
        var title: String { self == .weight ? "KG" : "REPS" }
    }

    var body: some View {
        VStack(spacing: 4) {
            VStack(alignment: .leading, spacing: 0) {
                Text(step.exerciseName)
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(step.label)
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            let values = store.values(for: step)
            HStack(spacing: 4) {
                ValueBox(
                    value: Self.format(values.weightKg),
                    unit: "KG"
                ) { editing = .weight }
                ValueBox(
                    value: Self.format(values.reps),
                    unit: "REPS"
                ) { editing = .reps }
            }

            StepControls(isCompleted: store.isCompleted(step)) {
                store.goToPreviousStep()
            } onComplete: {
                if let completed = store.completeCurrentSet() {
                    session.sendSetCompleted(completed, values: store.values(for: completed))
                }
            } onNext: {
                store.goToNextStep()
            }
        }
        .sheet(item: $editing) { field in
            NumericKeypadView(
                title: field.title,
                initial: field == .weight
                    ? store.values(for: step).weightKg
                    : store.values(for: step).reps,
                allowsDecimal: field == .weight
            ) { entered in
                switch field {
                case .weight: store.setValue(for: step.set.setId, weightKg: entered)
                case .reps: store.setValue(for: step.set.setId, reps: entered)
                }
                editing = nil
            }
        }
    }

    /// Whole numbers lose the decimal point — "60kg", not "60.0kg" — but a
    /// real fraction keeps it, since plate maths routinely lands on 2.5s.
    private static func format(_ value: Double?) -> String {
        guard let value else { return "–" }
        return value == value.rounded()
            ? String(Int(value))
            : String(format: "%.1f", value)
    }
}

/// One big tappable number with its unit underneath.
private struct ValueBox: View {
    let value: String
    let unit: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 0) {
                Text(value)
                    .font(.title3)
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text(unit)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(Color.gray.opacity(0.25), in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

/// Previous / complete / next. The tick is the primary action and sits in the
/// middle where a thumb lands; it turns filled once the set is logged so a
/// second tap reads as already-done rather than inviting a double entry.
private struct StepControls: View {
    let isCompleted: Bool
    let onPrevious: () -> Void
    let onComplete: () -> Void
    let onNext: () -> Void

    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        HStack {
            Button(action: onPrevious) {
                Image(systemName: "chevron.left")
            }
            .buttonStyle(.plain)
            .disabled(store.currentStepIndex == 0)

            Spacer()

            Button(action: onComplete) {
                Image(systemName: isCompleted ? "checkmark.circle.fill" : "checkmark")
                    .font(.title3)
                    .foregroundStyle(isCompleted ? .green : .black)
                    .frame(width: 52, height: 30)
                    .background(
                        isCompleted ? Color.green.opacity(0.2) : Color.green,
                        in: Capsule()
                    )
            }
            .buttonStyle(.plain)
            .disabled(isCompleted)

            Spacer()

            Button(action: onNext) {
                Image(systemName: "chevron.right")
            }
            .buttonStyle(.plain)
            .disabled(store.currentStepIndex >= store.steps.count - 1)
        }
    }
}

/// Rest between sets: how long is left, how far through it is, and what is
/// coming — so the wearer can set up for the next set without paging back.
private struct RestView: View {
    @EnvironmentObject private var store: WorkoutSessionStore

    @State private var now = Date()
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 3) {
            HStack {
                Button("Skip") { store.skipRest() }
                    .font(.caption2)
                    .buttonStyle(.plain)
                    .foregroundStyle(.blue)
                Spacer()
            }

            Text(remainingLabel)
                .font(.title2)
                .fontWeight(.semibold)
                .monospacedDigit()

            ProgressView(value: progress)
                .tint(.blue)

            if let next = store.currentStep {
                VStack(spacing: 0) {
                    Text("Next set")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                    Text(next.exerciseName)
                        .font(.caption2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(nextTargetLabel(for: next))
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 4) {
                Button("-15s") { store.adjustRest(bySeconds: -15) }
                Button("+15s") { store.adjustRest(bySeconds: 15) }
            }
            .font(.caption2)
            .buttonStyle(.bordered)
        }
        .onReceive(ticker) { value in now = value }
    }

    private var remainingSeconds: Int {
        guard let endsAt = store.restEndsAt else { return 0 }
        return max(0, Int(endsAt.timeIntervalSince(now).rounded()))
    }

    private var remainingLabel: String {
        String(format: "%d:%02d", remainingSeconds / 60, remainingSeconds % 60)
    }

    /// Fills as the rest runs down. Guards the denominator: `adjustRest` can
    /// only ever raise it, but a zero would still be a divide by zero here.
    private var progress: Double {
        let total = Double(store.restDurationSeconds)
        guard total > 0 else { return 0 }
        return min(1, max(0, 1 - Double(remainingSeconds) / total))
    }

    private func nextTargetLabel(for step: WorkoutStep) -> String {
        let values = store.values(for: step)
        switch (values.weightKg, values.reps) {
        case let (weight?, reps?):
            return "\(step.label) · \(Int(weight))kg × \(Int(reps))"
        case let (nil, reps?):
            return "\(step.label) · \(Int(reps)) reps"
        default:
            return step.label
        }
    }
}

/// Digit pad for one value. watchOS has no usable inline number field, and
/// the Digital Crown alone makes a 60 → 82.5 change a long scroll, so a
/// tapped value opens this instead.
private struct NumericKeypadView: View {
    let title: String
    let initial: Double?
    let allowsDecimal: Bool
    let onCommit: (Double) -> Void

    @State private var entry: String = ""
    @Environment(\.dismiss) private var dismiss

    private var keys: [String] {
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", allowsDecimal ? "." : "", "0", "⌫"]
    }

    var body: some View {
        VStack(spacing: 2) {
            HStack {
                Text(entry.isEmpty ? placeholder : entry)
                    .font(.title3)
                    .monospacedDigit()
                    .foregroundStyle(entry.isEmpty ? .secondary : .primary)
                Spacer()
                Text(title)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }

            LazyVGrid(columns: Array(repeating: GridItem(spacing: 2), count: 3), spacing: 2) {
                ForEach(keys, id: \.self) { key in
                    if key.isEmpty {
                        Color.clear.frame(height: 26)
                    } else {
                        Button(key) { press(key) }
                            .font(.body)
                            .frame(maxWidth: .infinity, minHeight: 26)
                            .buttonStyle(.plain)
                            .background(Color.gray.opacity(0.25), in: RoundedRectangle(cornerRadius: 6))
                    }
                }
            }

            Button("OK") {
                if let value = Double(entry) { onCommit(value) } else { dismiss() }
            }
            .font(.caption)
            .frame(maxWidth: .infinity)
            .tint(.green)
            .disabled(Double(entry) == nil)
        }
        .padding(.horizontal, 2)
    }

    private var placeholder: String {
        guard let initial else { return "0" }
        return initial == initial.rounded()
            ? String(Int(initial))
            : String(format: "%.1f", initial)
    }

    private func press(_ key: String) {
        switch key {
        case "⌫":
            if !entry.isEmpty { entry.removeLast() }
        case ".":
            if !entry.contains(".") { entry += entry.isEmpty ? "0." : "." }
        default:
            entry += key
        }
    }
}

#if DEBUG
/// A store already mid-workout, for the canvases below. `completedSets` marks
/// that many sets done — one is enough to put the view into its rest state,
/// since completing a set starts that set's rest.
@MainActor
private func previewStore(
    bpm: Double? = SampleDay.workoutBpm,
    completedSets: Int = 0
) -> WorkoutSessionStore {
    let store = WorkoutSessionStore.previewInstance()
    store.start(with: SampleDay.workoutPlan)
    if let bpm {
        store.recordHeartRate(bpm: bpm)
        store.recordActiveEnergy(kcal: 84)
    }
    for _ in 0..<completedSets {
        store.completeCurrentSet()
    }
    return store
}

#Preview("Mid-workout") {
    WorkoutView()
        .environmentObject(previewStore())
        .environmentObject(WatchSessionManager.shared)
}

#Preview("Resting") {
    WorkoutView()
        .environmentObject(previewStore(completedSets: 1))
        .environmentObject(WatchSessionManager.shared)
}

/// Before the phone has armed anything — what the tab shows most of the time.
#Preview("No workout") {
    WorkoutView()
        .environmentObject(WorkoutSessionStore.previewInstance())
        .environmentObject(WatchSessionManager.shared)
}

/// The no-heart-rate layout, which is also everything a simulator can render.
#Preview("No heart rate") {
    WorkoutView()
        .environmentObject(previewStore(bpm: nil))
        .environmentObject(WatchSessionManager.shared)
}
#endif
