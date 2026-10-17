import Foundation

/// What the stretch of route just ahead does to the wearer's legs, from the
/// whole-metre heights a route may carry. Pure, so it runs under the Mac test
/// package with the tracker.
enum WatchRouteClimb {
    /// How far ahead of the wearer the climb is looked for.
    static let lookAheadMeters: Double = 400
    /// A rise smaller than this is not worth a line on the screen.
    static let minimumGainMeters = 10

    struct Ahead: Equatable {
        /// Metres climbed from where the wearer is to the highest point in the window.
        let gainMeters: Int
        /// Metres along the route to that highest point.
        let overMeters: Double
    }

    /// The biggest rise within `lookAheadMeters` of `progressMeters`, measured
    /// from the wearer's own height to the highest point of the window (so a
    /// crest then a drop still reads as the climb up to it), or nil when it is
    /// under `minimumGainMeters` or the route has no heights for its points.
    static func ahead(route: WatchRoute, cumulative: [Double], progressMeters: Double) -> Ahead? {
        guard
            let heights = route.elevations,
            heights.count == route.points.count,
            cumulative.count == heights.count,
            heights.count > 1,
            let total = cumulative.last,
            progressMeters < total
        else { return nil }

        let here = height(at: progressMeters, heights: heights, cumulative: cumulative)
        let windowEnd = min(total, progressMeters + lookAheadMeters)

        var bestGain = 0.0
        var bestAt = progressMeters
        func consider(_ meters: Double, _ metresHigh: Double) {
            let gain = metresHigh - here
            if gain > bestGain {
                bestGain = gain
                bestAt = meters
            }
        }
        for i in cumulative.indices where cumulative[i] > progressMeters && cumulative[i] < windowEnd {
            consider(cumulative[i], Double(heights[i]))
        }
        consider(windowEnd, height(at: windowEnd, heights: heights, cumulative: cumulative))

        let gain = Int(bestGain.rounded())
        guard gain >= minimumGainMeters else { return nil }
        return Ahead(gainMeters: gain, overMeters: bestAt - progressMeters)
    }

    /// Whole-metre heights from the wire form: each entry is the zigzag of the
    /// step from the previous height (the first from 0), so every number sent
    /// is a small non-negative integer. The phone's `encodeWatchElevations`
    /// (`src/utils/watchRoute.ts`) is the other half; keep the two in step.
    static func decodeHeights(_ steps: [Int]) -> [Int] {
        var height = 0
        return steps.map { step in
            height += step % 2 == 0 ? step / 2 : -(step + 1) / 2
            return height
        }
    }

    /// The height `meters` along the line, between the two points either side.
    static func height(at meters: Double, heights: [Int], cumulative: [Double]) -> Double {
        if meters <= 0 { return Double(heights[0]) }
        guard let last = cumulative.last, meters < last else { return Double(heights[heights.count - 1]) }
        var low = 0
        var high = cumulative.count - 1
        while low < high {
            let mid = (low + high + 1) / 2
            if cumulative[mid] <= meters { low = mid } else { high = mid - 1 }
        }
        let next = min(low + 1, heights.count - 1)
        let span = cumulative[next] - cumulative[low]
        let t = span > 0 ? (meters - cumulative[low]) / span : 0
        return Double(heights[low]) + (Double(heights[next]) - Double(heights[low])) * t
    }
}
