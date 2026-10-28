import SwiftUI

/// The wearer's five heart-rate zones as the phone works them out (their own
/// settings, else their date of birth), sent as the five ascending bpm floors.
/// The zone rule is the phone's `heartRateZoneFor` in
/// `shared/src/utils/heartRateZones.ts`; keep the two in step.
struct WatchHeartRateZones: Codable, Equatable {
    /// Five ascending bpm floors, zone 1 first.
    let floors: [Int]

    static let count = 5

    /// The zones when `raw` (the phone's `runHeartRateZoneFloors`) is five
    /// ascending, believable bpm values; nil otherwise, so a malformed push
    /// never draws a nonsense bar.
    static func normalized(_ raw: Any?) -> WatchHeartRateZones? {
        guard let array = raw as? [Any], array.count == count else { return nil }
        let values = array.compactMap { ($0 as? NSNumber)?.intValue }
        guard values.count == count,
              values.allSatisfy({ $0 > 0 && $0 < 300 }),
              zip(values, values.dropFirst()).allSatisfy({ $0 < $1 }) else { return nil }
        return WatchHeartRateZones(floors: values)
    }

    /// 1 (easiest) to 5 for a reading, or 0 when it is below zone 1.
    func zone(for bpm: Double) -> Int {
        var zone = 0
        for (index, floor) in floors.enumerated() where bpm >= Double(floor) {
            zone = index + 1
        }
        return zone
    }

    /// Where a reading sits along a bar of five equal zone segments, 0 to 1.
    /// Inside a zone it moves with the reading; the top zone is as wide as the
    /// one below it, and a reading below zone 1 or above the top sits at an end.
    func position(for bpm: Double) -> Double {
        let zone = zone(for: bpm)
        guard zone > 0 else { return 0 }
        let lower = Double(floors[zone - 1])
        let upper = zone < Self.count
            ? Double(floors[zone])
            : lower + Double(floors[Self.count - 1] - floors[Self.count - 2])
        let within = min(max((bpm - lower) / max(upper - lower, 1), 0), 1)
        return (Double(zone - 1) + within) / Double(Self.count)
    }

    /// One color per zone, easy to hard: slate, blue, green, amber, red. The
    /// same colors as `HEART_RATE_ZONE_COLORS` on the phone.
    static let colors: [Color] = [
        Color(red: 0.580, green: 0.639, blue: 0.722),
        Color(red: 0.231, green: 0.510, blue: 0.965),
        Color(red: 0.133, green: 0.773, blue: 0.369),
        Color(red: 0.961, green: 0.620, blue: 0.043),
        Color(red: 0.937, green: 0.267, blue: 0.267),
    ]

    func color(for zone: Int) -> Color {
        Self.colors[min(max(zone, 1), Self.count) - 1]
    }
}
