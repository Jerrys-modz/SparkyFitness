import AppIntents
import SwiftUI
import WidgetKit

// Lock Screen and Control Center controls (iOS 18). Each is a button that runs
// one of the Siri and Shortcuts intents (ShortcutIntents.swift) without opening
// the app. They do nothing until the user turns on "Let Siri and Shortcuts log
// without opening the app" in the app: that switch is what puts the login in the
// shared Keychain group the intents read.

@available(iOS 18.0, *)
struct LogWaterControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.logWater"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: LogWaterIntent()) {
                Label("Log water", systemImage: "drop.fill")
            }
        }
        .displayName("Log water")
        .description("Logs a drink of your water container without opening SparkyFitness.")
    }
}

@available(iOS 18.0, *)
struct StartFastControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.startFast"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: StartFastIntent()) {
                Label("Start fast", systemImage: "timer")
            }
        }
        .displayName("Start fast")
        .description("Starts a 16 hour fast without opening SparkyFitness.")
    }
}

@available(iOS 18.0, *)
struct EndFastControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.endFast"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: EndFastIntent()) {
                Label("End fast", systemImage: "stop.circle")
            }
        }
        .displayName("End fast")
        .description("Ends your running fast without opening SparkyFitness.")
    }
}
