import SwiftUI

/// One reading on a cardio screen's tile row: "2.41 km", "8:12 /km", "152 bpm".
struct CardioStat: Identifiable {
    let id: String
    let value: String
    let unit: String
    /// A small glyph before the value (the heart on heart rate).
    var systemImage: String?
    var tint: Color = .white
}

/// A control on a cardio screen's button row, drawn as the strength workout's
/// squircle.
struct CardioControl: Identifiable {
    let id: String
    let systemImage: String
    let accessibilityLabel: String
    var prominent = false
    var tint: Color?
    var disabled = false
    let action: () -> Void
}

/// The live screen of a walk, run or ride, shared by the wrist-only recording
/// and the phone's GPS recording. Laid out like the strength workout: a quiet
/// header with the activity, its state and the GPS signal, the clock large,
/// the readings in the same dark tiles as the set values, and squircle buttons
/// along the bottom with the main one (pause or resume) in white.
struct CardioLiveLayout<Banner: View>: View {
    let systemImage: String
    /// "Indoor walk", "Outdoor run", "Ride".
    let title: String
    /// "Paused", "Auto-paused"; nil while it is going. Shown in the title's place.
    let status: String?
    /// The time to show at a moment, ticked every second.
    let elapsed: (Date) -> TimeInterval
    let stats: [CardioStat]
    let controls: [CardioControl]
    /// GPS signal bars beside the title, worked out at a moment so they go
    /// grey when fixes stop coming; nil hides them (indoors, or a recording
    /// whose GPS is on the phone).
    var signal: ((Date) -> GpsSignal)?
    /// The wearer's heart-rate zones and the current reading, for the zone bar
    /// between the clock and the tiles. No zones (the phone has not said) draws
    /// no bar.
    var zones: WatchHeartRateZones?
    var heartRate: Double?
    /// A plan's current step, under the clock. Gets the same moment as the clock.
    @ViewBuilder let banner: (Date) -> Banner

    /// Blue while it goes, orange while paused: the set screen's pill, tile and
    /// button colours all come from this one tint.
    private var tint: SetTint {
        status == nil ? .blue : SetTint(r: 1, g: 159 / 255, b: 10 / 255)
    }

    var body: some View {
        // Fits a 41 mm screen with a plan step showing, buttons included. The
        // scroll is only a fallback for larger text sizes.
        ScrollView {
            VStack(spacing: WatchStyle.m(6)) {
                header
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    VStack(spacing: WatchStyle.m(4)) {
                        Text(RecordingState.clock(elapsed(context.date)))
                            .font(.system(size: WatchStyle.num(34), weight: WatchStyle.numWeight))
                            .monospacedDigit()
                            .foregroundStyle(status == nil ? tint.light : Color.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.leading, WatchStyle.m(4))
                        Text(title)
                            .font(.system(size: WatchStyle.m(20), weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.leading, WatchStyle.m(4))
                            .accessibilityAddTraits(.isHeader)
                        banner(context.date)
                    }
                }
                if let zones {
                    ZoneBar(zones: zones, heartRate: heartRate)
                }
                HStack(spacing: WatchStyle.m(6)) {
                    ForEach(stats) { stat in
                        tile(stat)
                    }
                }
                controlRow
            }
            .padding(.horizontal, WatchStyle.side)
            // Room under the buttons for the screen's rounded corners.
            .padding(.bottom, WatchStyle.bottom)
        }
        .environment(\.setTint, tint)
        .scrollBounceBehavior(.basedOnSize)
        .scrollIndicators(.hidden)
    }

    /// The set screen's pill in the clock's row: the activity's glyph in a
    /// circle, and while paused the state beside it, so the line never has to
    /// hold the title as well and lose its end under the clock.
    private var header: some View {
        HStack(alignment: .center, spacing: WatchStyle.s(5)) {
            HStack(spacing: WatchStyle.m(7)) {
                ZStack {
                    Circle().fill(tint.pillIcon)
                    Image(systemName: systemImage)
                        .font(.system(size: WatchStyle.m(16), weight: .semibold))
                }
                .frame(width: WatchStyle.m(34), height: WatchStyle.m(34))
                if let status {
                    Text(status)
                        .font(.system(size: WatchStyle.m(17), weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            .foregroundStyle(tint.color)
            .padding(.leading, WatchStyle.m(4))
            .padding(.trailing, status == nil ? WatchStyle.m(4) : WatchStyle.m(13))
            .frame(height: WatchStyle.m(42))
            .background(tint.pill, in: Capsule())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(status.map { String(localized: "watch.run.titleWithStatus", defaultValue: "\(title), \($0)") } ?? title)
            Spacer(minLength: 0)
            if let signal {
                TimelineView(.periodic(from: .now, by: 5)) { context in
                    GpsSignalBars(signal: signal(context.date))
                }
            }
            // The system clock sits over the top right; keep the pill and the
            // signal out from under it.
            Color.clear.frame(width: WatchStyle.s(40), height: 1)
        }
        .padding(.top, WatchStyle.m(4))
    }

    /// A reading in the set screen's value tile: the unit small above, the
    /// value large in the tile's colour.
    private func tile(_ stat: CardioStat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(stat.unit)
                .font(.system(size: WatchStyle.m(12), weight: .semibold))
                .foregroundStyle(tint.color)
                .lineLimit(1)
            HStack(spacing: 2) {
                if let systemImage = stat.systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: WatchStyle.m(14), weight: .bold))
                }
                Text(stat.value)
                    .font(.system(size: WatchStyle.num(24), weight: WatchStyle.numWeight))
                    .monospacedDigit()
            }
            .foregroundStyle(stat.tint)
            .lineLimit(1)
            .minimumScaleFactor(0.55)
        }
        .padding(.horizontal, WatchStyle.m(8))
        .padding(.vertical, WatchStyle.m(4))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.tile, in: RoundedRectangle(cornerRadius: WatchStyle.m(18), style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /// Round buttons at the left, as the set screen's edit-previous one, and the
    /// main action (pause or resume) as the wide capsule at the right, worded
    /// like Log set.
    private var controlRow: some View {
        HStack(spacing: WatchStyle.m(6)) {
            ForEach(controls.filter { !$0.prominent }) { control in
                Button(action: Haptics.tapping(control.action)) {
                    Image(systemName: control.systemImage)
                        .font(.system(size: WatchStyle.m(17), weight: .semibold))
                        .foregroundStyle(control.tint ?? Color.white.opacity(0.75))
                        .frame(width: WatchStyle.m(44), height: WatchStyle.m(44))
                        .background(WatchStyle.surface, in: Circle())
                        .opacity(control.disabled ? 0.35 : 1)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(control.disabled)
                .accessibilityLabel(control.accessibilityLabel)
            }
            ForEach(controls.filter { $0.prominent }) { control in
                Button(action: Haptics.tapping(control.action)) {
                    Text(control.accessibilityLabel)
                        .font(.system(size: WatchStyle.m(18), weight: .bold))
                        .foregroundStyle(Color.black)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.m(44))
                        .background(tint.color, in: Capsule())
                        .opacity(control.disabled ? 0.35 : 1)
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(control.disabled)
            }
        }
    }
}

/// A plan's current step and countdown, then what comes next: a tinted strip
/// under the clock, so it reads as part of the timing rather than another tile.
struct CardioPlanStep: View {
    let label: String
    /// What is left of the step, already worded ("1:30", "400 m"); nil once
    /// the plan is complete.
    let remaining: String?
    let next: String?
    var tint: Color = .orange

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text(label)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                if let remaining {
                    Text(remaining)
                        .monospacedDigit()
                }
            }
            .font(.system(size: WatchStyle.s(14), weight: .bold))
            .foregroundStyle(tint)
            if let next {
                Text(String(localized: "watch.recording.next", defaultValue: "Next: \(next)"))
                    .font(.system(size: WatchStyle.s(11)))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .padding(.horizontal, WatchStyle.s(8))
        .padding(.vertical, WatchStyle.s(3))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: WatchStyle.s(10), style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// Three bars, lit by how good the GPS fix is: green when good, yellow when
/// fair, red when weak, grey with none.
struct GpsSignalBars: View {
    let signal: GpsSignal

    private var tint: Color {
        switch signal {
        case .good: return .green
        case .fair: return .yellow
        case .weak: return .red
        case .none: return .gray
        }
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: WatchStyle.s(2)) {
            ForEach(1...3, id: \.self) { bar in
                RoundedRectangle(cornerRadius: 1)
                    .fill(bar <= signal.rawValue ? tint : Color.white.opacity(0.25))
                    .frame(width: WatchStyle.s(3), height: WatchStyle.s(CGFloat(3 + bar * 3)))
            }
        }
        .accessibilityElement()
        .accessibilityLabel(signal.label)
    }
}
