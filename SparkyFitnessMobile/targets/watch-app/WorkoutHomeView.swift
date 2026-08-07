import SwiftUI

/// Workout tab root: a live session (started here or on the phone) always
/// wins over the start list, mirroring `ActiveWorkoutBar`'s "one live
/// workout at a time" rule on the phone.
struct WorkoutHomeView: View {
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        NavigationStack {
            Group {
                if let active = session.context.activeWorkout {
                    ActiveWorkoutView(workout: active)
                } else {
                    PresetListView(presets: session.context.presets ?? [])
                }
            }
            .navigationTitle("Workout")
        }
    }
}

private struct PresetListView: View {
    let presets: [WatchPresetSummary]
    @EnvironmentObject private var session: WatchSessionManager
    @State private var startingPresetId: Int?

    var body: some View {
        Group {
            if presets.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text(session.isReachable ? "No workout presets" : "Open SparkyFitness on your phone")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
            } else {
                List(presets) { preset in
                    Button {
                        start(preset)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(preset.name)
                                .font(.system(size: 15, weight: .medium))
                                .lineLimit(1)
                            Text("\(preset.exerciseCount) exercise\(preset.exerciseCount == 1 ? "" : "s")")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .disabled(startingPresetId != nil)
                }
            }
        }
    }

    private func start(_ preset: WatchPresetSummary) {
        startingPresetId = preset.id
        session.send(.startPreset(presetId: preset.id))
        // The phone owns creation; once it seeds the store the pushed context
        // flips `activeWorkout` non-nil and this view is replaced. Clear the
        // lock after a timeout in case the phone never responds (unreachable,
        // no server connection) so the row isn't stuck disabled forever.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
            if startingPresetId == preset.id {
                startingPresetId = nil
            }
        }
    }
}
