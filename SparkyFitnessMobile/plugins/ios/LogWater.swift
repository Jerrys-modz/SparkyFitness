import AppIntents
import Foundation
import Security

// "Log water" App Intent: logs one drink of the user's current water container
// without opening the app, then shows the result on screen. Reachable from
// Siri, Spotlight, the Shortcuts app and the Action button.
//
// It needs the login the app keeps in the Keychain item read below (written by
// modules/background-water while a server is signed in). Removing the active
// server or signing out erases that item.
//
// This file is added to the app target by plugins/withBackgroundWater.ts: an
// intent has to be in the app target to be discovered. The Keychain service and
// account must match modules/background-water.

private let backgroundWaterService = "com.sparkyapps.sparkyfitness.backgroundWater"
private let backgroundWaterAccount = "config"

private struct BackgroundWaterConfig: Decodable {
    let baseUrl: String
    let headers: [String: String]
    let containerId: Int
    let containerName: String
    let volumeLabel: String?

    static func load() -> BackgroundWaterConfig? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: backgroundWaterService,
            kSecAttrAccount as String: backgroundWaterAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(BackgroundWaterConfig.self, from: data)
    }
}

private func localDateString() -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone.current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date())
}

@available(iOS 16.0, *)
struct LogWaterIntent: AppIntent {
    static var title: LocalizedStringResource = "Log water"
    static var description = IntentDescription(
        "Logs one drink of your current water container without opening SparkyFitness."
    )
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let config = BackgroundWaterConfig.load() else {
            return .result(dialog: "Open SparkyFitness and sign in to a server first.")
        }
        guard let url = URL(string: config.baseUrl + "/api/measurements/water-intake") else {
            return .result(dialog: "The SparkyFitness server address is not valid.")
        }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = "POST"
        for (name, value) in config.headers {
            request.setValue(value, forHTTPHeaderField: name)
        }
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "entry_date": localDateString(),
            "change_drinks": 1,
            "container_id": config.containerId,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (200..<300).contains(status) {
                let what = config.volumeLabel.map { "\(config.containerName) (\($0))" } ?? config.containerName
                return .result(dialog: "Logged 1 × \(what).")
            }
            if status == 401 || status == 403 {
                return .result(dialog: "Your SparkyFitness login expired. Open the app once to sign in again.")
            }
            return .result(dialog: "SparkyFitness could not log the water (error \(status)).")
        } catch {
            return .result(dialog: "SparkyFitness could not reach your server.")
        }
    }
}

@available(iOS 16.0, *)
struct SparkyFitnessShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogWaterIntent(),
            phrases: [
                "Log water in \(.applicationName)",
                "Add water to \(.applicationName)",
            ],
            shortTitle: "Log water",
            systemImageName: "drop.fill"
        )
    }
}
