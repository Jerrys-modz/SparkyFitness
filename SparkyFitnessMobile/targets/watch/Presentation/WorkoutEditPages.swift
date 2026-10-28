import SwiftUI

/// The pages under the set screen, reached by scrolling up from the bottom:
/// what can be done to this set, to this exercise, and to the workout.
///
/// Every change is a request to the phone, which owns the workout. It applies
/// the change and sends the updated plan back, so the screen follows a moment
/// after the tap rather than changing locally.

// MARK: - Set options

struct SetOptionsPage: View {
    let step: WorkoutStep

    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var store: WorkoutSessionStore
    @State private var choosingType = false
    @State private var choosingSide = false
    @State private var confirmingDelete = false

    var body: some View {
        EditPage(title: String(localized: "watch.workout.setOptions", defaultValue: "Set options"), compact: store.isPerSide(step)) {
            Button(String(localized: "watch.workout.addSet", defaultValue: "Add Set")) {
                Haptics.tap()
                session.sendWorkoutEdit(.addSet(exerciseEntryId: step.exerciseEntryId))
            }
            Button(String(localized: "watch.workout.setType", defaultValue: "Set Type")) {
                Haptics.tap()
                choosingType = true
            }
            // One button for both side actions: the page can't scroll, so a
            // second one would push Delete Set off a small screen.
            if store.isPerSide(step) {
                Button(String(localized: "watch.workout.side", defaultValue: "Side")) {
                    Haptics.tap()
                    choosingSide = true
                }
            }
            Button(String(localized: "watch.workout.deleteSet", defaultValue: "Delete Set")) {
                Haptics.tap()
                confirmingDelete = true
            }
            .buttonStyle(EditPageButtonStyle(fill: .red, compact: store.isPerSide(step)))
        }
        .sheet(isPresented: $choosingType) {
            SetTypeSheet(current: step.plannedSet.setType) { type in
                session.sendWorkoutEdit(.setSetType(setId: step.plannedSet.setId, type: type))
            }
        }
        .sheet(isPresented: $choosingSide) {
            SetSideSheet(
                current: step.plannedSet.side,
                onPick: { side in
                    session.sendWorkoutEdit(.setSetSide(setId: step.plannedSet.setId, side: side))
                },
                onAddOtherSide: {
                    session.sendWorkoutEdit(.addOtherSide(setId: step.plannedSet.setId))
                }
            )
        }
        .confirmationDialog(
            String(localized: "watch.workout.deleteSetConfirm", defaultValue: "Delete this set?"),
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button(String(localized: "watch.common.delete", defaultValue: "Delete"), role: .destructive) {
                Haptics.tap()
                session.sendWorkoutEdit(.deleteSet(setId: step.plannedSet.setId))
            }
            Button(String(localized: "watch.common.cancel", defaultValue: "Cancel"), role: .cancel) { Haptics.tap() }
        } message: {
            Text(String(localized: "watch.workout.lastSetRemovesExercise", defaultValue: "An exercise's last set removes the exercise."))
        }
    }
}

private struct SetTypeSheet: View {
    let current: String?
    let onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    private let types: [(id: String, name: String)] = [
        ("normal", String(localized: "watch.workout.setType.normal", defaultValue: "Normal")),
        ("warmup", String(localized: "watch.workout.setType.warmup", defaultValue: "Warm-up")),
        ("drop", String(localized: "watch.workout.setType.drop", defaultValue: "Drop set")),
        ("failure", String(localized: "watch.workout.setType.failure", defaultValue: "Failure")),
    ]

    var body: some View {
        NavigationStack {
            List(types, id: \.id) { type in
                Button {
                    Haptics.tap()
                    onPick(type.id)
                    dismiss()
                } label: {
                    HStack {
                        Text(type.name)
                        Spacer(minLength: 0)
                        if (current ?? "normal").lowercased() == type.id {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "watch.workout.setType", defaultValue: "Set Type"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct SetSideSheet: View {
    let current: String?
    let onPick: (String) -> Void
    let onAddOtherSide: () -> Void

    @Environment(\.dismiss) private var dismiss

    private var sides: [(id: String, name: String)] {
        [
            ("both", String(localized: "watch.workout.sideBoth", defaultValue: "Both sides")),
            ("left", String(localized: "watch.workout.sideLeft", defaultValue: "Left")),
            ("right", String(localized: "watch.workout.sideRight", defaultValue: "Right")),
        ]
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(sides, id: \.id) { side in
                    Button {
                        Haptics.tap()
                        onPick(side.id)
                        dismiss()
                    } label: {
                        HStack {
                            Text(side.name)
                            Spacer(minLength: 0)
                            if (current ?? "both").lowercased() == side.id {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
                Button(String(localized: "watch.workout.addOtherSide", defaultValue: "Add Other Side")) {
                    Haptics.tap()
                    onAddOtherSide()
                    dismiss()
                }
            }
            .navigationTitle(String(localized: "watch.workout.side", defaultValue: "Side"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Exercise options

struct ExerciseOptionsPage: View {
    let step: WorkoutStep

    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @State private var addingExercise = false
    @State private var confirmingDelete = false
    @State private var swapping = false

    var body: some View {
        EditPage(title: String(localized: "watch.workout.exerciseOptions", defaultValue: "Exercise options")) {
            if checkIn.context.exerciseDoNow == true, !store.upcomingExercises.isEmpty {
                Button(String(localized: "watch.workout.swapExercise", defaultValue: "Swap Exercise")) {
                    Haptics.tap()
                    swapping = true
                }
            }
            Button(String(localized: "watch.workout.addExercise", defaultValue: "Add Exercise")) {
                Haptics.tap()
                addingExercise = true
            }
            Button(String(localized: "watch.workout.deleteExercise", defaultValue: "Delete Exercise")) {
                Haptics.tap()
                confirmingDelete = true
            }
            .buttonStyle(EditPageButtonStyle(fill: .red))
        }
        .sheet(isPresented: $addingExercise) { AddExerciseSheet() }
        .sheet(isPresented: $swapping) { SwapExerciseSheet() }
        .confirmationDialog(
            String(localized: "watch.workout.deleteExerciseConfirm", defaultValue: "Delete \(step.exerciseName)?"),
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button(String(localized: "watch.common.delete", defaultValue: "Delete"), role: .destructive) {
                Haptics.tap()
                session.sendWorkoutEdit(.deleteExercise(exerciseEntryId: step.exerciseEntryId))
            }
            Button(String(localized: "watch.common.cancel", defaultValue: "Cancel"), role: .cancel) { Haptics.tap() }
        } message: {
            Text(String(localized: "watch.workout.deleteExerciseMessage", defaultValue: "Its sets are removed from this workout."))
        }
    }
}

// MARK: - Workout actions

/// Add an exercise, finish, or throw the workout away. The same end controls
/// the exercise list carries, one scroll from the set screen.
struct WorkoutActionsPage: View {
    @EnvironmentObject private var session: WatchSessionManager
    @State private var addingExercise = false
    @State private var confirmingFinish = false
    @State private var confirmingDiscard = false

    var body: some View {
        EditPage(title: String(localized: "watch.workout.title", defaultValue: "Workout")) {
            Button(String(localized: "watch.workout.addExercise", defaultValue: "Add Exercise")) {
                Haptics.tap()
                addingExercise = true
            }
            Button(String(localized: "watch.workout.finishWorkout", defaultValue: "Finish Workout")) {
                Haptics.tap()
                confirmingFinish = true
            }
            .buttonStyle(EditPageButtonStyle(fill: .blue))
            Button(String(localized: "watch.workout.discardWorkout", defaultValue: "Discard Workout")) {
                Haptics.tap()
                confirmingDiscard = true
            }
            .buttonStyle(EditPageButtonStyle(fill: .red))
        }
        .sheet(isPresented: $addingExercise) { AddExerciseSheet() }
        .endWorkoutDialogs(
            confirmingFinish: $confirmingFinish,
            confirmingDiscard: $confirmingDiscard
        )
    }
}

// MARK: - Shared pieces

/// A page of big buttons under a small title, one screen tall.
private struct EditPage<Content: View>: View {
    let title: String
    var compact = false
    @ViewBuilder let content: Content

    var body: some View {
        // Has to fit one screen without scrolling: the page itself is one
        // stop of the workout's vertical paging, and a scroll inside it
        // fought that. Hence the compact `EditPageButtonStyle`.
        VStack(spacing: 6) {
            Text(title)
                .watchFont(.footnote, classic: .caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
            content
                .buttonStyle(EditPageButtonStyle(compact: compact))
        }
        // The button height is fixed; this keeps the text inside it legible
        // rather than shrunk to nothing at the largest sizes.
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .frame(maxHeight: .infinity, alignment: .center)
        .padding(.horizontal, 2)
    }
}

/// The edit pages' buttons: a fixed, compact height (the system bordered
/// button is taller, and three of them overflowed a 40 mm screen at larger
/// text sizes), one line of text that shrinks rather than wraps.
private struct EditPageButtonStyle: ButtonStyle {
    var fill: Color = WatchStyle.fill
    /// Shorter buttons for a page that carries a fourth one.
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .watchFont(.body.weight(.semibold), classic: .system(size: 15, weight: .semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity)
            .frame(height: WatchStyle.s(compact ? 32 : 40))
            .background(fill, in: Capsule())
            .opacity(configuration.isPressed ? 0.7 : 1)
            .contentShape(Capsule())
    }
}

/// The exercises the phone offered. A tap asks it to add one to the workout.
struct AddExerciseSheet: View {
    @EnvironmentObject private var checkIn: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager
    @Environment(\.dismiss) private var dismiss

    private var exercises: [SuggestedExercise] { checkIn.context.suggestedExercises ?? [] }

    var body: some View {
        NavigationStack {
            Group {
                if exercises.isEmpty {
                    Text(String(localized: "watch.workout.recentEmpty", defaultValue: "Recent exercises appear here once your iPhone has sent them."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding()
                } else {
                    List(exercises) { exercise in
                        Button {
                            Haptics.tap()
                            session.sendWorkoutEdit(.addExercise(exerciseId: exercise.exerciseId))
                            dismiss()
                        } label: {
                            Text(exercise.name)
                                .lineLimit(2)
                                .minimumScaleFactor(0.8)
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "watch.workout.addExercise", defaultValue: "Add Exercise"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// The Finish and Discard confirmations, shared by the exercise list and the
/// workout page so the wording and the order of events stay the same.
extension View {
    func endWorkoutDialogs(
        confirmingFinish: Binding<Bool>,
        confirmingDiscard: Binding<Bool>,
        beforeEnding: @escaping () -> Void = {}
    ) -> some View {
        modifier(EndWorkoutDialogs(
            confirmingFinish: confirmingFinish,
            confirmingDiscard: confirmingDiscard,
            beforeEnding: beforeEnding
        ))
    }
}

private struct EndWorkoutDialogs: ViewModifier {
    @Binding var confirmingFinish: Bool
    @Binding var confirmingDiscard: Bool
    let beforeEnding: () -> Void

    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var store: WorkoutSessionStore

    func body(content: Content) -> some View {
        content
            .confirmationDialog(
                String(localized: "watch.workout.finishConfirm", defaultValue: "Finish workout?"),
                isPresented: $confirmingFinish,
                titleVisibility: .visible
            ) {
                Button(String(localized: "watch.common.finish", defaultValue: "Finish"), role: .destructive) {
                    Haptics.tap()
                    // The caller's sheet is dismissed first so it is not
                    // re-rendering against a plan that `endWorkout` has
                    // already cleared.
                    beforeEnding()
                    if !store.askPresetUpdateBeforeFinish() { session.endWorkout() }
                }
                Button(String(localized: "watch.common.cancel", defaultValue: "Cancel"), role: .cancel) { Haptics.tap() }
            } message: {
                Text(String(localized: "watch.workout.finishMessage", defaultValue: "Heart rate for this session is sent to your phone."))
            }
            .confirmationDialog(
                String(localized: "watch.workout.discardConfirm", defaultValue: "Discard workout?"),
                isPresented: $confirmingDiscard,
                titleVisibility: .visible
            ) {
                Button(String(localized: "watch.common.discard", defaultValue: "Discard"), role: .destructive) {
                    Haptics.tap()
                    beforeEnding()
                    session.discardWorkout()
                }
                Button(String(localized: "watch.common.cancel", defaultValue: "Cancel"), role: .cancel) { Haptics.tap() }
            } message: {
                Text(String(localized: "watch.workout.discardMessage", defaultValue: "This workout won't be saved."))
            }
    }
}
