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
                Label("widget.control.log_water.name", systemImage: "drop.fill")
            }
        }
        .displayName("widget.control.log_water.name")
        .description("widget.control.log_water.description")
    }
}

@available(iOS 18.0, *)
struct StartFastControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.startFast"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: StartFastIntent()) {
                Label("widget.control.start_fast.name", systemImage: "timer")
            }
        }
        .displayName("widget.control.start_fast.name")
        .description("widget.control.start_fast.description")
    }
}

@available(iOS 18.0, *)
struct EndFastControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.endFast"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: EndFastIntent()) {
                Label("widget.control.end_fast.name", systemImage: "stop.circle")
            }
        }
        .displayName("widget.control.end_fast.name")
        .description("widget.control.end_fast.description")
    }
}

// These two open the app on the screen they name, using the same deep links as
// the Home Screen widgets. They are here so Control Center and the Lock Screen
// can hold the everyday ways in, not only the ones that log in the background.

@available(iOS 18.0, *)
struct ScanFoodControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.scanFood"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenURLIntent(URL(string: "sparkyfitnessmobile://scan")!)) {
                Label("widget.control.scan_food.name", systemImage: "barcode.viewfinder")
            }
        }
        .displayName("widget.control.scan_food.name")
        .description("widget.control.scan_food.description")
    }
}

@available(iOS 18.0, *)
struct SearchFoodControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.searchFood"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenURLIntent(URL(string: "sparkyfitnessmobile://search")!)) {
                Label("widget.control.search_food.name", systemImage: "magnifyingglass")
            }
        }
        .displayName("widget.control.search_food.name")
        .description("widget.control.search_food.description")
    }
}

/// Takes the last drink off today's total, for a mis-tap. The same request the
/// water widget's minus button makes.
@available(iOS 18.0, *)
struct RemoveWaterControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.removeWater"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: RemoveWaterIntent()) {
                Label("widget.control.remove_water.name", systemImage: "minus.circle")
            }
        }
        .displayName("widget.control.remove_water.name")
        .description("widget.control.remove_water.description")
    }
}
