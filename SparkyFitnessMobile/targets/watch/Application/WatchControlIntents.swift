import AppIntents
import Foundation

// Buttons for the watch's Control Center and Action button (watchOS 26), made
// in targets/watch-widget/WatchControls.swift. Each opens the watch app and
// leaves a note in the shared app group saying what the wearer wanted; the app,
// once it is in front, reads it (`ContentView.pickUpControlRoute`) and does it.
//
// Same reasoning as the iPhone controls (targets/widget/ShortcutIntents.swift):
// `openAppWhenRun`, no parameters, no URL. Logging a drink has to go through
// the app because only it can reach the phone, and the app is the one that
// keeps the queue for a phone that is out of range.
//
// This file exists twice, identically: here for the app and in
// targets/watch-widget for the extension, because a control that opens the app
// needs its intent compiled into both. `watchControlIntents.test.ts` fails if
// the two copies drift apart.
private func leaveWatchControlRoute(_ route: String) {
    if let group = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
       let defaults = UserDefaults(suiteName: group) {
        defaults.set(route, forKey: "pendingWatchControlRoute")
    }
}

@available(watchOS 10.0, *)
struct LogWaterWatchIntent: AppIntent {
    static var title: LocalizedStringResource = "Log water"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        leaveWatchControlRoute("logWater")
        return .result()
    }
}

@available(watchOS 10.0, *)
struct OpenFastingWatchIntent: AppIntent {
    static var title: LocalizedStringResource = "Open fasting"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        leaveWatchControlRoute("fasting")
        return .result()
    }
}
