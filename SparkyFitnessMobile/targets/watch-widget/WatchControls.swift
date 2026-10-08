import AppIntents
import SwiftUI
import WidgetKit

// Controls for the watch's Control Center and Action button (watchOS 11). Each
// opens the watch app, which does the work: see WatchControlIntents.swift.

@available(watchOS 11.0, *)
struct LogWaterWatchControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.watchcontrol.logWater"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: LogWaterWatchIntent()) {
                Label("Log water", systemImage: "drop.fill")
            }
        }
        .displayName("Log water")
        .description("Logs a drink of your first water container.")
    }
}

@available(watchOS 11.0, *)
struct FastingWatchControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.watchcontrol.fasting"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenFastingWatchIntent()) {
                Label("Fasting", systemImage: "timer")
            }
        }
        .displayName("Fasting")
        .description("Opens your fast, where you can start or end it.")
    }
}
