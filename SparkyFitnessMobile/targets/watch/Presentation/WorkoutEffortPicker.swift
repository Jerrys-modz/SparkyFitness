import SwiftUI

/// "How hard was that?" for a finished workout: a 1-10 wheel and a Save
/// button. `save` runs the actual write and reports whether it worked; the
/// picker only tracks the choice and the saved state.
struct WorkoutEffortPicker: View {
    let save: (Int, @escaping (Bool) -> Void) -> Void
    /// Starts mid-scale so a quick tap is a sensible answer.
    @State private var effort = 5
    @State private var saved = false

    private var title: String {
        String(localized: "watch.effort.title", defaultValue: "How hard was that?")
    }

    var body: some View {
        VStack(spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            if saved {
                Label(
                    String(localized: "watch.effort.saved", defaultValue: "Saved to Health"),
                    systemImage: "checkmark"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.green)
            } else {
                Picker(title, selection: $effort) {
                    ForEach(1...10, id: \.self) { Text("\($0)").tag($0) }
                }
                .pickerStyle(.wheel)
                .frame(height: 60)
                Button(String(localized: "watch.rpe.save", defaultValue: "Save")) {
                    save(effort) { saved = $0 }
                }
            }
        }
        .padding(.top, 4)
    }
}
