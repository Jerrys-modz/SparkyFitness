import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var session: WatchSessionManager

    private var today: WatchTodayPayload? { session.context.today }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let today {
                    ZStack {
                        ProgressRing(progress: today.progress, lineWidth: 9)
                            .frame(width: 92, height: 92)
                        VStack(spacing: 0) {
                            Text(formatWhole(today.remaining))
                                .font(.system(size: 22, weight: .bold, design: .rounded))
                                .minimumScaleFactor(0.6)
                                .lineLimit(1)
                            Text("kcal left")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.top, 4)

                    VStack(spacing: 4) {
                        StatRow(label: "Food", value: formatWhole(today.food))
                        StatRow(label: "Burned", value: formatWhole(today.burned))
                        StatRow(label: "Goal", value: formatWhole(today.goal))
                    }

                    Divider()

                    HStack(spacing: 8) {
                        MacroPill(label: "P", grams: today.protein)
                        MacroPill(label: "C", grams: today.carbs)
                        MacroPill(label: "F", grams: today.fat)
                    }

                    if let staleness = relativeStaleness(generatedAt: session.context.generatedAt) {
                        Text(staleness)
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                    }
                } else {
                    VStack(spacing: 8) {
                        ProgressView()
                        Text(session.isReachable ? "Waiting for phone…" : "Open SparkyFitness on your phone")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 24)
                }
            }
            .padding(.horizontal, 6)
        }
        .navigationTitle("Today")
    }
}

private struct StatRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.system(size: 15, weight: .medium, design: .rounded))
        }
    }
}

private struct MacroPill: View {
    let label: String
    let grams: Double

    var body: some View {
        VStack(spacing: 1) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(formatWhole(grams))
                .font(.system(size: 13, weight: .medium, design: .rounded))
        }
        .frame(maxWidth: .infinity)
    }
}

#if DEBUG
#Preview {
    let manager = WatchSessionManager.shared
    manager.context = WatchAppContext(
        today: WatchTodayPayload(date: "2026-08-06", food: 1540, burned: 255, goal: 3055, remaining: 1515, progress: 0.5, protein: 120, carbs: 180, fat: 55),
        presets: [],
        activeWorkout: nil,
        serverConnected: true,
        generatedAt: Date().timeIntervalSince1970
    )
    return TodayView().environmentObject(manager)
}
#endif
