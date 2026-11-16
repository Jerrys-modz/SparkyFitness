import SwiftUI

/// Five heart-rate zone segments with a marker at the current reading, under
/// the clock on a cardio screen. The zone the reading is in is drawn at full
/// strength and the rest dimmed; with no reading yet every segment is dimmed.
struct ZoneBar: View {
    let zones: WatchHeartRateZones
    let heartRate: Double?

    private let markerSize = WatchStyle.m(12)

    private var zone: Int? { heartRate.map { zones.zone(for: $0) } }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                HStack(spacing: WatchStyle.m(2)) {
                    ForEach(1...WatchHeartRateZones.count, id: \.self) { index in
                        Capsule()
                            .fill(zones.color(for: index))
                            .opacity(zone == index ? 1 : 0.4)
                    }
                }
                .frame(height: WatchStyle.m(7))
                if let heartRate {
                    Circle()
                        .fill(Color.white)
                        .frame(width: markerSize, height: markerSize)
                        .shadow(color: .black.opacity(0.5), radius: 1)
                        .offset(x: max(0, proxy.size.width * zones.position(for: heartRate) - markerSize / 2))
                }
            }
            .frame(maxHeight: .infinity, alignment: .center)
        }
        .frame(height: WatchStyle.m(12))
        .padding(.horizontal, WatchStyle.m(4))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            zone.map { $0 > 0
                ? String(localized: "watch.run.zoneLabel", defaultValue: "Heart rate zone \($0)")
                : String(localized: "watch.run.zoneBelow", defaultValue: "Heart rate below zone 1")
            } ?? String(localized: "watch.run.zoneNone", defaultValue: "Heart rate zones")
        )
    }
}
