import Foundation

/// What a wrist-only recording needs to carry on after the watch app is
/// killed mid-run: the Health session itself survives, but the route, the
/// heart-rate readings and the run's identity live only in memory.
///
/// Written while a run is going and removed when it ends. Its existence at
/// launch is what says a run was left going.
struct WatchRunSnapshot: Codable {
    var clientId: String
    var kind: String
    var place: String
    var startedAt: Date
    var routeSegment: Double
    var pausedByAutoPause: Bool
    var routeRows: [[Double]]
    var heartRateRows: [[Double]]
    var distanceMeters: Double
    var activeEnergyKcal: Double
    /// Active seconds when this was written, so a run that cannot be
    /// re-attached is still sent with roughly the right length.
    var elapsed: TimeInterval
    var savedAt: Date

    /// A run left this long ago is not one the wearer is still doing.
    static let maxAge: TimeInterval = 12 * 60 * 60
}

/// The snapshot on disk. A file rather than defaults: an hour's route is
/// hundreds of kilobytes.
enum WatchRunSnapshotStore {
    private static var url: URL? {
        try? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("watch-run-snapshot.json")
    }

    static func load() -> WatchRunSnapshot? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WatchRunSnapshot.self, from: data)
    }

    static func save(_ snapshot: WatchRunSnapshot) {
        guard let url, let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func clear() {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }

    static var exists: Bool { load() != nil }
}
