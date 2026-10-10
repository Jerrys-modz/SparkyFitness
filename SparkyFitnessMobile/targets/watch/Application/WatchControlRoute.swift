import Foundation

/// The note a watch control leaves for the app (`WatchControlIntents.swift`).
enum WatchControlRoute {
    private static let key = "pendingWatchControlRoute"

    /// The pending route, removed as it is read. Nil when there is none.
    static func take() -> String? {
        guard
            let group = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
            let defaults = UserDefaults(suiteName: group),
            let route = defaults.string(forKey: key),
            !route.isEmpty
        else { return nil }
        defaults.removeObject(forKey: key)
        return route
    }
}
