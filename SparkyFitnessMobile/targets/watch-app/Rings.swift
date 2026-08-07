import SwiftUI

/// Plain circular progress track + fill, shared by the calorie ring and the
/// rest timer. Deliberately styled like `targets/widget/widgets.swift`'s
/// `CalorieRing` so the watch app and the home-screen widget read as the same
/// product.
struct ProgressRing: View {
    let progress: Double // 0-1
    var lineWidth: CGFloat = 8
    var tint: Color = .accentColor
    var trackOpacity: Double = 0.2

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.secondary.opacity(trackOpacity), style: StrokeStyle(lineWidth: lineWidth))
            Circle()
                .trim(from: 0, to: CGFloat(max(0, min(1, progress))))
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeInOut(duration: 0.35), value: progress)
        }
    }
}

/// Rest-timer ring that ticks itself from an absolute deadline via
/// `TimelineView`, the same OS-driven approach the Live Activity's rest bar
/// uses (`ProgressView(timerInterval:)`) — no polling timer to leak or drift.
struct RestCountdownRing: View {
    let durationSec: Int
    /// Epoch ms deadline. `nil` renders a static empty ring (paused/ready).
    let endsAt: Double?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let progress = remainingProgress(now: context.date)
            ProgressRing(progress: progress, lineWidth: 10, tint: .accentColor)
        }
    }

    private func remainingProgress(now: Date) -> Double {
        guard let endsAt, durationSec > 0 else { return 0 }
        let end = Date(timeIntervalSince1970: endsAt / 1000)
        let remaining = end.timeIntervalSince(now)
        return max(0, min(1, remaining / Double(durationSec)))
    }
}
