import SwiftUI

/// The Fasting page: how long the current fast has run and how far it is from
/// its goal. Read-only; fasts are started and ended on the phone.
struct FastingView: View {
    @EnvironmentObject private var store: CheckInStore

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            if let fast = store.context.fast {
                running(fast, now: timeline.date)
            } else {
                idle
            }
        }
    }

    private func running(_ fast: WatchFast, now: Date) -> some View {
        let elapsed = max(0, now.timeIntervalSince(fast.startedAt))
        let total = fast.targetEndAt.map { max(1, $0.timeIntervalSince(fast.startedAt)) }
        let progress = total.map { min(1, elapsed / $0) }
        return VStack(spacing: 6) {
            Text(fast.label.map { "Fasting · \($0)" } ?? "Fasting")
                .font(.caption2)
                .foregroundStyle(.secondary)
            ZStack {
                if let progress {
                    Circle()
                        .stroke(Color.gray.opacity(0.25), lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(progress >= 1 ? Color.green : Color.orange,
                                style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                Text(Self.clock(elapsed))
                    .font(.title3)
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            .frame(width: 110, height: 110)
            if let total {
                let remaining = total - elapsed
                Text(remaining > 0 ? "\(Self.clock(remaining)) to go" : "Goal reached")
                    .font(.caption2)
                    .foregroundStyle(remaining > 0 ? Color.secondary : Color.green)
                    .monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var idle: some View {
        VStack(spacing: 6) {
            Image(systemName: "fork.knife")
                .font(.title2)
                .foregroundStyle(.secondary)
            Text(store.context.fastSynced == true ? "Not fasting" : "Waiting for your iPhone")
                .font(.footnote)
            if store.context.fastSynced == true {
                Text("Start a fast on your iPhone.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// 14:05 for under an hour is 14:05; an hour or more reads 16h 05m.
    static func clock(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        return hours > 0
            ? String(format: "%dh %02dm", hours, minutes)
            : String(format: "%d:%02d", minutes, secs)
    }
}
