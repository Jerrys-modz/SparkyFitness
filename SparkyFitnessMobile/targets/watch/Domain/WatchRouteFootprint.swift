import Foundation

// The watch's offline map: nearby paths the phone knew about, drawn as thin
// lines under the route so a run with no connection (MapKit's tiles stay blank)
// still has something to be oriented by. The lines come from the person's own
// other saved routes, never from a tile server; the phone chooses and thins
// them (`buildRouteFootprint`), the watch only decodes, bounds and draws them.
// Pure Foundation, so it runs under the Mac test package with the tracker.

enum WatchRouteFootprint {
    /// The most lines kept. The phone sends no more; this bounds a bad payload.
    static let maxLines = 12
    /// The most points kept across all lines.
    static let maxPoints = 600

    /// Lines from the wire: each a flat `[lat, lon, …]` in millionths of a
    /// degree. A line with an odd count or fewer than two points is skipped, as
    /// is any past the caps; nil when nothing usable is left.
    static func decode(_ raw: [[Double]]) -> [[WatchRoutePoint]]? {
        var lines: [[WatchRoutePoint]] = []
        var total = 0
        for flat in raw {
            if lines.count >= maxLines { break }
            guard flat.count >= 4, flat.count % 2 == 0 else { continue }
            let count = flat.count / 2
            if total + count > maxPoints { continue }
            lines.append(stride(from: 0, to: flat.count, by: 2).map {
                WatchRoutePoint(lat: flat[$0] / 1_000_000, lon: flat[$0 + 1] / 1_000_000)
            })
            total += count
        }
        return lines.isEmpty ? nil : lines
    }

    /// Visible width of the follow camera as a share of its height above the
    /// ground, from `WatchRouteCamera.baseDistance` (450 m is about 200 m across).
    static let acrossPerCameraDistance: Double = 200.0 / 450.0

    static func acrossMeters(cameraDistance: Double) -> Double {
        cameraDistance * acrossPerCameraDistance
    }

    /// Metres in a degree of longitude at `lat`.
    static func metersPerDegreeLongitude(at lat: Double) -> Double {
        111_320 * cos(lat * .pi / 180)
    }

    /// A round scale-bar length (1, 2 or 5 times a power of ten) that fits in
    /// about a third of `acrossMeters`; nil when the view is too small to say.
    static func scaleBarMeters(acrossMeters: Double) -> Double? {
        let target = acrossMeters / 3
        guard target >= 1, target.isFinite else { return nil }
        let magnitude = pow(10, floor(log10(target)))
        for step in [5.0, 2.0, 1.0] where step * magnitude <= target {
            return step * magnitude
        }
        return magnitude
    }
}
