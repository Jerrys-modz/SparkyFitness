import SwiftUI
import WatchKit

/// Dark-theme category colours, in the same order as `SUPERSET_PALETTE_VARS`
/// (`workoutSupersets.ts`). Run 0 is blue, then orange, violet, green, pink,
/// teal, amber, slate. Values are the dark `--color-cat-*` tokens from
/// `global.css`, not the light ones — the watch UI is always dark.
private enum SupersetPalette {
    private static let colors: [Color] = [
        Color(red: 105 / 255, green: 146 / 255, blue: 211 / 255),
        Color(red: 209 / 255, green: 138 / 255, blue: 97 / 255),
        Color(red: 145 / 255, green: 102 / 255, blue: 204 / 255),
        Color(red: 106 / 255, green: 164 / 255, blue: 111 / 255),
        Color(red: 204 / 255, green: 102 / 255, blue: 136 / 255),
        Color(red: 90 / 255, green: 173 / 255, blue: 175 / 255),
        Color(red: 212 / 255, green: 169 / 255, blue: 84 / 255),
        Color(red: 110 / 255, green: 118 / 255, blue: 135 / 255),
    ]

    static func color(for run: Int) -> Color {
        colors[abs(run) % colors.count]
    }
}

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

/// Format name and time left on the cap. Nil for an ordinary set workout.
/// Rounds added on the phone are not in this yet: the watch still has only
/// the sets it was armed with.
private func intervalCaption(plan: ActiveWorkoutPlan?, now: Date) -> String? {
    guard let format = plan?.workoutFormat?.lowercased(), format != "standard" else {
        return nil
    }
    let name: String
    switch format {
    case "amrap": name = "AMRAP"
    case "emom": name = "EMOM"
    case "tabata": name = "TABATA"
    case "for_time": name = "FOR TIME"
    default: name = format.uppercased()
    }
    guard
        let cap = plan?.timeCapSeconds, cap > 0
    else { return name }
    let clock = plan?.pausedAt ?? now
    let pausedAlready = plan?.excludedPauseSeconds ?? 0
    let left: Int
    if let capEnds = plan?.capEndsAt {
        let end = capEnds.addingTimeInterval(TimeInterval(pausedAlready))
        left = max(0, Int(end.timeIntervalSince(clock).rounded()))
    } else if let started = plan?.startedAt {
        let elapsed = Int(clock.timeIntervalSince(started)) - pausedAlready
        left = max(0, cap - max(0, elapsed))
    } else {
        return name
    }
    let minutes = left / 60
    let seconds = left % 60
    return String(format: "%@ %d:%02d", name, minutes, seconds)
}

/// Ticks once a second. `intervalCaption` reads `now` itself, so it has to
/// live in a view that redraws on a clock — the parent only redraws when the
/// store changes, which left the cap sitting still between sets.
///
/// Uses `TimelineView` rather than a `Timer.publish` stored on the view: the
/// store republishes `elapsedSeconds` every second, which re-creates this
/// struct and with it a fresh publisher that never gets to fire.
private struct IntervalCaptionView: View {
    let plan: ActiveWorkoutPlan?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            if let caption = intervalCaption(plan: plan, now: context.date) {
                Text(caption)
                    .font(.caption2)
                    .foregroundStyle(.yellow)
                    .monospacedDigit()
            }
        }
    }
}

private struct ActiveWorkoutView: View {
    @EnvironmentObject private var store: WorkoutSessionStore

    @State private var showingExercises = false

    /// Always available, including during rest: Finish lives in the picker
    /// sheet, and hiding the chevron while resting left no way to end the
    /// HealthKit session from the wrist.
    private var openExerciseList: (() -> Void)? {
        { showingExercises = true }
    }

    var body: some View {
        VStack(spacing: 4) {
            MetricsStrip(onBack: openExerciseList)
            if let format = store.plan?.workoutFormat?.lowercased(), format != "standard" {
                IntervalCaptionView(plan: store.plan)
            }

            if store.isResting {
                RestView()
            } else if let step = store.currentStep {
                CurrentSetView(step: step)
            } else {
                WorkoutCompleteView()
            }
        }
        .padding(.horizontal, 4)
        .sheet(isPresented: $showingExercises) {
            ExerciseListView { exerciseEntryId in
                store.jumpToExercise(exerciseEntryId)
            }
        }
        .onAppear {
            #if DEBUG
            if ScreenshotSeed.opensExerciseList {
                showingExercises = true
            }
            #endif
        }
    }
}

/// Shown after the last set is logged. Finish used to live only in the
/// exercise-picker sheet, which was easy to miss.
private struct WorkoutCompleteView: View {
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        VStack(spacing: 8) {
            Spacer()
            Text("Workout complete")
                .font(.headline)
            Button("Finish") {
                session.endWorkout()
            }
            .font(.caption)
            .tint(.green)
            Spacer()
        }
    }
}

/// Consecutive members of one superset, or a run of exercises that are not.
private struct ExerciseBlock: Identifiable {
    let id: String
    let header: String?
    let supersetRun: Int?
    var exercises: [PlannedExercise]
}

/// Every exercise in the preset, so the wearer can work out of order — skip
/// ahead when a machine is taken, or come back to something left half done.
/// Selecting one resumes it at its first unlogged set rather than restarting.
///
/// Text-only, unlike Hevy's thumbnails: exercise images live behind the
/// server's authenticated `/file/{id}` route, and the watch has no
/// credentials of its own to fetch them with.
private struct ExerciseListView: View {
    let onSelect: (String) -> Void

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager
    @Environment(\.dismiss) private var dismiss

    @State private var confirmingFinish = false

    private var exercises: [PlannedExercise] { store.plan?.exercises ?? [] }

    /// Consecutive members of one superset stay together under one header.
    /// Solos stay in the plain list.
    private var blocks: [ExerciseBlock] {
        var blocks: [ExerciseBlock] = []
        for exercise in exercises {
            if let run = exercise.supersetRun,
               let index = blocks.indices.last,
               blocks[index].id == "superset-\(run)" {
                blocks[index].exercises.append(exercise)
                continue
            }
            if exercise.supersetRun == nil,
               let index = blocks.indices.last,
               blocks[index].header == nil {
                blocks[index].exercises.append(exercise)
                continue
            }
            let run = exercise.supersetRun
            if let run {
                blocks.append(
                    ExerciseBlock(
                        id: "superset-\(run)",
                        header: "Superset",
                        supersetRun: run,
                        exercises: [exercise]
                    )
                )
            } else {
                blocks.append(
                    ExerciseBlock(
                        id: exercise.exerciseEntryId,
                        header: nil,
                        supersetRun: nil,
                        exercises: [exercise]
                    )
                )
            }
        }
        return blocks
    }

    var body: some View {
        List {
            Section {
                Text("\(exercises.count) Exercises")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }
            ForEach(blocks) { block in
                Section {
                    ForEach(block.exercises) { exercise in
                        Button {
                            onSelect(exercise.exerciseEntryId)
                            dismiss()
                        } label: {
                            ExerciseRow(exercise: exercise)
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    if let header = block.header, let run = block.supersetRun {
                        Text(header)
                            .foregroundStyle(SupersetPalette.color(for: run))
                    }
                }
            }

            // Finishing lives here rather than on the set screen: this is the
            // workout's overview, and an end-everything button one tap from
            // the tick that logs a set is a mis-tap waiting to happen.
            Section {
                Button(role: .destructive) {
                    confirmingFinish = true
                } label: {
                    Label("Finish Workout", systemImage: "flag.checkered")
                        .font(.caption)
                }
            }
        }
        .confirmationDialog(
            "Finish workout?",
            isPresented: $confirmingFinish,
            titleVisibility: .visible
        ) {
            Button("Finish", role: .destructive) {
                // Dismissed first so the sheet is not re-rendering against a
                // plan that `endWorkout` has already cleared.
                dismiss()
                session.endWorkout()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Heart rate for this session is sent to your phone.")
        }
    }
}

private struct ExerciseRow: View {
    let exercise: PlannedExercise

    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        HStack(spacing: 4) {
            VStack(alignment: .leading, spacing: 1) {
                Text(exercise.name)
                    .font(.caption)
                    .lineLimit(2)
                Text(subtitle)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if store.isComplete(exercise) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.caption2)
                    .foregroundStyle(.green)
            }
        }
        .padding(.leading, exercise.supersetRun == nil ? 0 : 8)
        .background(alignment: .leading) {
            if let run = exercise.supersetRun {
                SupersetPalette.color(for: run)
                    .frame(width: 3)
            }
        }
    }

    /// "3 Sets" until something is logged, then "1/3 Sets" — the count alone
    /// stops being the useful number once the wearer is part way in.
    private var subtitle: String {
        let done = store.completedSetCount(for: exercise)
        let total = exercise.sets.count
        return done == 0 ? "\(total) Sets" : "\(done)/\(total) Sets"
    }
}

/// Calories, elapsed time and heart rate on one line, always visible. Kept
/// deliberately small: it is reference information, not the thing being
/// interacted with, and the set values below need the room.
private struct MetricsStrip: View {
    /// Non-nil puts a back chevron at the leading edge, opening the exercise
    /// picker. Inline here rather than on its own row above: a watch screen
    /// cannot spare a whole row for one control.
    var onBack: (() -> Void)?

    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        HStack(spacing: 6) {
            if let onBack = onBack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.blue)
            }
            if let kcal = store.activeEnergyKcal {
                Self.metric("\(Int(kcal))", systemImage: "flame.fill")
                    .foregroundStyle(.orange)
                    .minimumScaleFactor(0.7)
            }
            Text(Self.elapsed(store.elapsedSeconds))
                .foregroundStyle(.secondary)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 0)
            if let bpm = store.latestBpm {
                // Never truncated: a three-digit rate used to lose its last
                // digits to the calories and clock beside it. Those shrink
                // first instead.
                Self.metric("\(Int(bpm.rounded()))", systemImage: "heart.fill")
                    .foregroundStyle(.red)
                    .fixedSize()
                    .layoutPriority(1)
            }
        }
        .font(.caption2)
        .monospacedDigit()
        .lineLimit(1)
    }

    /// Icon and value with a tighter gap than `Label`'s, which is sized for
    /// list rows and left too little room on this strip.
    private static func metric(_ value: String, systemImage: String) -> some View {
        HStack(spacing: 2) {
            Image(systemName: systemImage)
            Text(value)
        }
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
    @EnvironmentObject private var checkIn: CheckInStore

    /// Which field the keypad is editing, if any.
    @State private var editing: EditableField?

    /// Crown mode: the field the crown and a drag adjust in place, Hevy-style.
    @State private var crownField: EditableField?
    /// The value on screen while `crownField` is being adjusted. Written to
    /// the store once it settles rather than per detent: every write persists
    /// the workout snapshot, and a fast spin is dozens of detents a second.
    @State private var crownValue: Double = 0
    @State private var pendingCommit: Task<Void, Never>?
    /// `crownValue` when the current drag began.
    @State private var dragStartValue: Double?
    /// Steps the current drag has moved, so each new step clicks once.
    @State private var dragSteps: Double = 0
    @FocusState private var crownFocused: Bool

    private var unit: WeightUnit { checkIn.context.effectiveWeightUnit }
    private var inputStyle: SetInputStyle { checkIn.context.effectiveSetInputStyle }

    private var supersetColor: Color? {
        guard let run = step.supersetRun else { return nil }
        return SupersetPalette.color(for: run)
    }

    private enum EditableField: Identifiable {
        case weight, reps
        var id: Int { self == .weight ? 0 : 1 }
    }

    var body: some View {
        VStack(spacing: 4) {
            VStack(alignment: .leading, spacing: 0) {
                Text(step.exerciseName)
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let partners = step.supersetWith {
                    Text("Superset · \(partners)")
                        .font(.system(size: 9))
                        .foregroundStyle(supersetColor ?? Color.secondary)
                        .lineLimit(1)
                }
                Text(step.label)
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 4) {
                valueBox(.weight)
                valueBox(.reps)
            }
            .focusable(crownField != nil)
            .focused($crownFocused)
            .digitalCrownRotation(
                $crownValue,
                from: 0,
                through: maxValue(for: crownField ?? .weight),
                by: stepSize(for: crownField ?? .weight),
                // Low: at medium a small turn ran several plates past the one
                // wanted.
                sensitivity: .low,
                isContinuous: false,
                isHapticFeedbackEnabled: true
            )
            .onChange(of: crownValue) { scheduleCommit() }

            if crownField != nil {
                Text("Crown or drag · tap again to type")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }

            StepControls(isCompleted: store.isCompleted(step)) {
                endCrownEditing()
                store.goToPreviousStep()
            } onComplete: {
                // The value on screen is what gets logged, settled or not.
                endCrownEditing()
                if let completed = store.completeCurrentSet() {
                    session.sendSetCompleted(completed, values: store.values(for: completed))
                }
            } onNext: {
                endCrownEditing()
                store.goToNextStep()
            }
        }
        // Moving to another set by any other route (the phone logging this
        // one, a jump from the exercise list) settles the edit first.
        .onChange(of: step.plannedSet.setId) { endCrownEditing() }
        .onDisappear { endCrownEditing() }
        .sheet(item: $editing) { field in
            NumericKeypadView(
                title: title(for: field),
                initial: storedValue(for: field),
                allowsDecimal: field == .weight
            ) { entered in
                write(entered, to: field)
                editing = nil
            }
        }
    }

    private func valueBox(_ field: EditableField) -> some View {
        let isSelected = crownField == field
        let shown = isSelected ? snapped(crownValue, for: field) : storedValue(for: field)
        return ValueBox(
            value: Self.format(shown),
            unit: title(for: field),
            isSelected: isSelected
        ) {
            tapped(field)
        }
        // Drag up to raise, down to lower, one step per 12pt — only on the
        // box being adjusted, so a stray swipe elsewhere changes nothing.
        .highPriorityGesture(
            DragGesture(minimumDistance: 4)
                .onChanged { gesture in
                    guard isSelected else { return }
                    let start = dragStartValue ?? snapped(crownValue, for: field)
                    if dragStartValue == nil {
                        dragStartValue = start
                        dragSteps = 0
                    }
                    let steps = (-gesture.translation.height / 12).rounded()
                    guard steps != dragSteps else { return }
                    dragSteps = steps
                    crownValue = clamp(start + steps * stepSize(for: field), for: field)
                    // The crown clicks each detent by itself; a drag has to
                    // be told to.
                    stepClick()
                }
                .onEnded { _ in dragStartValue = nil },
            including: isSelected ? .all : .subviews
        )
    }

    /// Keypad mode opens the keypad. Crown mode selects the box for the crown;
    /// tapping the selected box again opens the keypad for an exact value.
    private func tapped(_ field: EditableField) {
        guard inputStyle == .crown else {
            editing = field
            return
        }
        if crownField == field {
            endCrownEditing()
            editing = field
            return
        }
        endCrownEditing()
        crownValue = clamp(storedValue(for: field) ?? 0, for: field)
        crownField = field
        // Next turn of the run loop: the row only becomes focusable once
        // `crownField` is set, and focus asked for before that is dropped.
        DispatchQueue.main.async { crownFocused = true }
    }

    private func scheduleCommit() {
        guard crownField != nil else { return }
        pendingCommit?.cancel()
        pendingCommit = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            commitCrownValue()
        }
    }

    private func commitCrownValue() {
        guard let field = crownField else { return }
        let value = snapped(crownValue, for: field)
        if value != storedValue(for: field) {
            write(value, to: field)
        }
    }

    /// Saves the value being adjusted and deselects it.
    private func endCrownEditing() {
        pendingCommit?.cancel()
        pendingCommit = nil
        commitCrownValue()
        crownField = nil
        crownFocused = false
        dragStartValue = nil
    }

    private func storedValue(for field: EditableField) -> Double? {
        let values = store.values(for: step)
        switch field {
        case .weight: return values.weightKg.map(unit.fromKg)
        case .reps: return values.reps
        }
    }

    private func write(_ value: Double, to field: EditableField) {
        switch field {
        case .weight:
            store.setValue(for: step.plannedSet.setId, weightKg: unit.toKg(value))
        case .reps:
            store.setValue(for: step.plannedSet.setId, reps: value)
        }
    }

    private func title(for field: EditableField) -> String {
        field == .weight ? (unit == .lbs ? "LB" : "KG") : "REPS"
    }

    /// Half a pound or kilo per crown detent, as Hevy does; a rep at a time.
    private func stepSize(for field: EditableField) -> Double {
        field == .weight ? 0.5 : 1
    }

    private func maxValue(for field: EditableField) -> Double {
        field == .weight ? (unit == .lbs ? 1500 : 700) : 200
    }

    /// The crown hands over in-between values while it turns (10.3 reps) and
    /// only settles on a step once it stops; what is shown and saved is the
    /// nearest step.
    private func snapped(_ value: Double, for field: EditableField) -> Double {
        let step = stepSize(for: field)
        return clamp((value / step).rounded() * step, for: field)
    }

    /// One click per crown or drag step, silent while the phone's Settings →
    /// Haptics switch is off (`WatchContext.effectiveHapticsEnabled`).
    private func stepClick() {
        MainActor.assumeIsolated {
            guard CheckInStore.shared.context.effectiveHapticsEnabled else { return }
            WKInterfaceDevice.current().play(.click)
        }
    }

    private func clamp(_ value: Double, for field: EditableField) -> Double {
        min(max(value, 0), maxValue(for: field))
    }

    /// Whole numbers lose the decimal point — "60kg", not "60.0kg" — but a
    /// real fraction keeps it, since plate maths routinely lands on 2.5s.
    static func format(_ value: Double?) -> String {
        guard let value else { return "–" }
        return value == value.rounded()
            ? String(Int(value))
            : String(format: "%.1f", value)
    }
}

/// One big tappable number with its unit underneath. Outlined while the crown
/// is adjusting it.
private struct ValueBox: View {
    let value: String
    let unit: String
    var isSelected = false
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
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.green, lineWidth: isSelected ? 2 : 0)
            )
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
                    // Spelled `Color.x` rather than `.x`: the parameter is an
                    // opaque `some ShapeStyle`, which gives a ternary's two
                    // branches nothing to infer a shared type from.
                    .foregroundStyle(isCompleted ? Color.green : Color.black)
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
    @EnvironmentObject private var checkIn: CheckInStore

    /// `TimelineView`, not a stored `Timer.publish`: the store republishes
    /// every second, re-creating this struct and its publisher before it can
    /// fire, which left the countdown frozen at its starting value.
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            content(now: context.date)
        }
    }

    private func content(now: Date) -> some View {
        VStack(spacing: 3) {
            HStack {
                Button("Skip") { store.skipRest() }
                    .font(.caption2)
                    .buttonStyle(.plain)
                    .foregroundStyle(.blue)
                    .disabled(store.restPausedRemaining != nil)
                Spacer()
                if store.restPausedRemaining != nil {
                    Text("Paused")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }

            Text(remainingLabel(now: now))
                .font(.title2)
                .fontWeight(.semibold)
                .monospacedDigit()

            ProgressView(value: progress(now: now))
                .tint(.blue)

            if let next = store.currentStep {
                VStack(spacing: 0) {
                    Text(continuesSuperset(next) ? "Next in superset" : "Next set")
                        .font(.system(size: 9))
                        .foregroundStyle(nextSupersetColor(next) ?? Color.secondary)
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
            // Paused on the phone: it owns the rest until it resumes.
            .disabled(store.restPausedRemaining != nil)
        }
    }

    private func remainingSeconds(now: Date) -> Int {
        if let paused = store.restPausedRemaining {
            return max(0, Int(paused.rounded()))
        }
        guard let endsAt = store.restEndsAt else { return 0 }
        return max(0, Int(endsAt.timeIntervalSince(now).rounded()))
    }

    private func remainingLabel(now: Date) -> String {
        let remaining = remainingSeconds(now: now)
        return String(format: "%d:%02d", remaining / 60, remaining % 60)
    }

    /// Fills as the rest runs down. Guards the denominator: `adjustRest` can
    /// only ever raise it, but a zero would still be a divide by zero here.
    private func progress(now: Date) -> Double {
        let total = Double(store.restDurationSeconds)
        guard total > 0 else { return 0 }
        return min(1, max(0, 1 - Double(remainingSeconds(now: now)) / total))
    }

    /// True only when this rest stays inside the superset just logged.
    /// Entering a superset, or leaving one for another, is still "Next set".
    private func continuesSuperset(_ next: WorkoutStep) -> Bool {
        guard let nextRun = next.supersetRun, store.currentStepIndex > 0 else {
            return false
        }
        return store.steps[store.currentStepIndex - 1].supersetRun == nextRun
    }

    private func nextSupersetColor(_ step: WorkoutStep) -> Color? {
        guard continuesSuperset(step), let run = step.supersetRun else { return nil }
        return SupersetPalette.color(for: run)
    }

    private func nextTargetLabel(for step: WorkoutStep) -> String {
        let values = store.values(for: step)
        let unit = checkIn.context.effectiveWeightUnit
        switch (values.weightKg, values.reps) {
        case let (weight?, reps?):
            let shown = unit.fromKg(weight)
            let weightText = shown == shown.rounded()
                ? String(Int(shown))
                : String(format: "%.1f", shown)
            return "\(step.label) · \(weightText)\(unit.suffix) × \(Int(reps))"
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
            // Centered, not leading: the sheet's close button sits in the
            // top-leading corner and covered a left-aligned number.
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(entry.isEmpty ? placeholder : entry)
                    .font(.title3)
                    .monospacedDigit()
                    .foregroundStyle(entry.isEmpty ? Color.secondary : Color.primary)
                Text(title)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)

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
                // Nothing typed keeps the value shown in grey.
                if let value = Double(entry) {
                    onCommit(value)
                } else if let initial {
                    onCommit(initial)
                } else {
                    dismiss()
                }
            }
            .font(.caption)
            .frame(maxWidth: .infinity)
            .tint(.green)
            .disabled(Double(entry) == nil && initial == nil)
        }
        .padding(.horizontal, 2)
        // Opens empty with the current value in grey rather than filled in,
        // so a new number is typed straight away instead of deleting the old
        // one first; OK with nothing typed keeps the grey value.
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
        .environmentObject(CheckInStore.shared)
}

#Preview("Resting") {
    WorkoutView()
        .environmentObject(previewStore(completedSets: 1))
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(CheckInStore.shared)
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
        .environmentObject(CheckInStore.shared)
}

/// The picker reached from the back chevron, one exercise part way done.
#Preview("Exercise picker") {
    ExerciseListView { _ in }
        .environmentObject(previewStore(completedSets: 1))
        .environmentObject(WatchSessionManager.shared)
}
#endif
