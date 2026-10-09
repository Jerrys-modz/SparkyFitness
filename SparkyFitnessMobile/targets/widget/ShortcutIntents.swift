import AppIntents
import Foundation
import Security

// Siri and Shortcuts actions that log without opening the app, then say what
// happened on screen: Log water, Log weight, Start fast and End fast. They also
// show up in Spotlight and can be put on the Action button.
//
// They need the login the app keeps in the Keychain item read below (written by
// modules/background-water while a server is signed in). Removing the active
// server or signing out erases that item.
//
// This file is compiled into both the app target (copied there by
// plugins/withBackgroundWater.ts, as intents must be in the app target to be
// discovered) and the widget extension, so Lock Screen and Control Center
// controls run these same intents. The Keychain service, account and shared
// access group must match modules/background-water.

private let backgroundWaterService = "com.sparkyapps.sparkyfitness.backgroundWater"
private let backgroundWaterAccount = "config"
private let setupMessage = "Open SparkyFitness and sign in to a server first."

/// The Keychain group the app and the widget extension share, filled in at
/// build time. Nil means a build without it, where only the app can read it.
private func sharedKeychainGroup() -> String? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "SparkyKeychainGroup") as? String,
          !group.isEmpty, !group.contains("$(") else { return nil }
    return group
}

/// The widget extension is an `.appex`. App Intents compiled into the app,
/// including Shortcuts, run in the `.app`.
private func isAppTargetProcess() -> Bool {
    Bundle.main.bundleURL.pathExtension != "appex"
}

/// Reads the shortcut login. Passing no access group searches every group this
/// process can use, not a specific one.
private func copyShortcutItem(accessGroup: String?) -> (data: Data, accessGroup: String?)? {
    var query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: backgroundWaterService,
        kSecAttrAccount as String: backgroundWaterAccount,
        kSecReturnData as String: true,
        kSecReturnAttributes as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    if let accessGroup {
        query[kSecAttrAccessGroup as String] = accessGroup
    }
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let item = result as? [String: Any],
          let data = item[kSecValueData as String] as? Data else { return nil }
    return (data, item[kSecAttrAccessGroup as String] as? String)
}

private struct ShortcutConfig: Decodable {
    let baseUrl: String
    let headers: [String: String]
    let containerId: Int?
    let containerName: String?
    let volumeLabel: String?
    /// "kg" or "lbs": the unit the user types a weight in.
    let weightUnit: String?

    static func load() -> ShortcutConfig? {
        let sharedGroup = sharedKeychainGroup()
        if let shared = copyShortcutItem(accessGroup: sharedGroup) {
            return try? JSONDecoder().decode(ShortcutConfig.self, from: shared.data)
        }
        // Older builds stored this with no access group, so it sits in the
        // app's private group. Searching without a group only walks groups
        // this process belongs to: the app can see that private item, the
        // widget cannot. Move it into the shared group the first time the
        // app, including an app Shortcut, reads it. A Lock Screen control
        // used before that still needs the app opened once.
        guard isAppTargetProcess(),
              let sharedGroup,
              let legacy = copyShortcutItem(accessGroup: nil),
              legacy.accessGroup != sharedGroup,
              let config = try? JSONDecoder().decode(ShortcutConfig.self, from: legacy.data) else {
            return nil
        }
        var add: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: backgroundWaterService,
            kSecAttrAccount as String: backgroundWaterAccount,
            kSecAttrAccessGroup as String: sharedGroup,
            kSecValueData as String: legacy.data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecSuccess || status == errSecDuplicateItem,
           let legacyGroup = legacy.accessGroup {
            let delete: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: backgroundWaterService,
                kSecAttrAccount as String: backgroundWaterAccount,
                kSecAttrAccessGroup as String: legacyGroup,
            ]
            SecItemDelete(delete as CFDictionary)
        }
        return config
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

private func isoString(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
}

/// Answers a redirect with its own 3xx response instead of following it, so the
/// saved login and proxy headers never go to another host.
private final class RefuseRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

private enum ShortcutCall {
    /// What went wrong, in words the user can act on.
    enum Failure: Error {
        case notSetUp
        case expired
        case server(Int)
        case unreachable

        var message: String {
            switch self {
            case .notSetUp: return setupMessage
            case .expired: return "Your SparkyFitness login expired. Open the app once to sign in again."
            case .server(let status): return "SparkyFitness could not do that (error \(status))."
            case .unreachable: return "SparkyFitness could not reach your server."
            }
        }
    }

    static func config() throws -> ShortcutConfig {
        guard let config = ShortcutConfig.load() else { throw Failure.notSetUp }
        return config
    }

    /// Sends one request and returns the body, or throws a `Failure`.
    static func send(
        _ config: ShortcutConfig,
        method: String,
        path: String,
        body: [String: Any]? = nil
    ) async throws -> Data {
        guard let url = URL(string: config.baseUrl + path) else { throw Failure.unreachable }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = method
        for (name, value) in config.headers {
            request.setValue(value, forHTTPHeaderField: name)
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        do {
            let (data, response) = try await URLSession.shared.data(for: request, delegate: RefuseRedirects())
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (200..<300).contains(status) { return data }
            if status == 401 || status == 403 { throw Failure.expired }
            throw Failure.server(status)
        } catch let failure as Failure {
            throw failure
        } catch {
            throw Failure.unreachable
        }
    }
}

@available(iOS 16.0, *)
struct LogWaterIntent: AppIntent {
    static var title: LocalizedStringResource = "Log water"
    static var description = IntentDescription(
        "Logs drinks of your current water container without opening SparkyFitness."
    )
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Drinks", default: 1, inclusiveRange: (1, 20))
    var drinks: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$drinks) water")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        do {
            let config = try ShortcutCall.config()
            guard let containerId = config.containerId, let name = config.containerName else {
                return .result(dialog: "Pick a water container in SparkyFitness first.")
            }
            _ = try await ShortcutCall.send(
                config, method: "POST", path: "/api/measurements/water-intake",
                body: [
                    "entry_date": localDateString(),
                    "change_drinks": drinks,
                    "container_id": containerId,
                ]
            )
            let what = config.volumeLabel.map { "\(name) (\($0))" } ?? name
            return .result(dialog: "Logged \(drinks) × \(what).")
        } catch let failure as ShortcutCall.Failure {
            return .result(dialog: IntentDialog(stringLiteral: failure.message))
        }
    }
}

@available(iOS 16.0, *)
struct LogWeightIntent: AppIntent {
    static var title: LocalizedStringResource = "Log weight"
    static var description = IntentDescription(
        "Saves today's weight in SparkyFitness without opening it."
    )
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Weight", inclusiveRange: (20, 700))
    var weight: Double

    static var parameterSummary: some ParameterSummary {
        Summary("Log weight \(\.$weight)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        do {
            let config = try ShortcutCall.config()
            let usesPounds = config.weightUnit == "lbs"
            let kg = usesPounds ? weight * 0.45359237 : weight
            _ = try await ShortcutCall.send(
                config, method: "POST", path: "/api/measurements/check-in",
                body: ["entry_date": localDateString(), "weight": kg]
            )
            let shown = String(format: "%.1f", weight)
            return .result(dialog: "Logged \(shown) \(usesPounds ? "lb" : "kg").")
        } catch let failure as ShortcutCall.Failure {
            return .result(dialog: IntentDialog(stringLiteral: failure.message))
        }
    }
}

@available(iOS 16.0, *)
struct StartFastIntent: AppIntent {
    static var title: LocalizedStringResource = "Start fast"
    static var description = IntentDescription(
        "Starts a fast now, without opening SparkyFitness."
    )
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Hours", default: 16, inclusiveRange: (1, 72))
    var hours: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Start a \(\.$hours) hour fast")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        do {
            let config = try ShortcutCall.config()
            let now = Date()
            let target = now.addingTimeInterval(Double(hours) * 3600)
            // The app treats `fasting_type` as an opaque label; "16:8" is the
            // shape its own presets use.
            let label = "\(hours):\(max(0, 24 - hours))"
            _ = try await ShortcutCall.send(
                config, method: "POST", path: "/api/fasting/start",
                body: [
                    "start_time": isoString(now),
                    "target_end_time": isoString(target),
                    "fasting_type": label,
                ]
            )
            return .result(dialog: "Started a \(hours) hour fast.")
        } catch let failure as ShortcutCall.Failure {
            return .result(dialog: IntentDialog(stringLiteral: failure.message))
        }
    }
}

@available(iOS 16.0, *)
struct EndFastIntent: AppIntent {
    static var title: LocalizedStringResource = "End fast"
    static var description = IntentDescription(
        "Ends your running fast now, without opening SparkyFitness."
    )
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        do {
            let config = try ShortcutCall.config()
            let current = try await ShortcutCall.send(config, method: "GET", path: "/api/fasting/current")
            guard
                let fast = try? JSONSerialization.jsonObject(with: current) as? [String: Any],
                let id = fast["id"] as? String,
                let startedAt = fast["start_time"] as? String
            else {
                return .result(dialog: "You are not fasting right now.")
            }
            // With auto-calculation on, /current also answers with a fast worked
            // out from the user's meals. During its eating window that is the
            // opposite of fasting, and a calculated fast has no row to end.
            if fast["is_eating_window"] as? Bool == true {
                return .result(dialog: "You are not fasting right now.")
            }
            if fast["is_auto_calculated"] as? Bool == true {
                return .result(dialog: "Your fast is worked out from your meals, so there is nothing to end. It ends when you log your next meal.")
            }
            _ = try await ShortcutCall.send(
                config, method: "POST", path: "/api/fasting/end",
                body: ["id": id, "start_time": startedAt, "end_time": isoString(Date())]
            )
            return .result(dialog: "Ended your fast.")
        } catch let failure as ShortcutCall.Failure {
            return .result(dialog: IntentDialog(stringLiteral: failure.message))
        }
    }
}

/// Opens SparkyFitness on a food screen, for the Scan food and Log food
/// controls. A control cannot be relied on to open a custom URL (Apple's
/// guidance is universal links only, and custom schemes fail on some iOS 18
/// releases), but `openAppWhenRun` does bring the app forward, so each of these
/// leaves a note in the shared app group and the app, once it is in front, reads
/// it and goes there (`useControlRouteHandoff`). They take no parameters on
/// purpose: reports of controls that would not open the app all involve
/// intents with extra parameters. The file is compiled into the app target as
/// well as the widget extension, which a control that opens the app needs.
private func leaveControlRoute(_ route: String) {
    if let group = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
       let defaults = UserDefaults(suiteName: group) {
        defaults.set(route, forKey: "pendingControlRoute")
    }
}

@available(iOS 18.0, *)
struct ScanFoodControlIntent: AppIntent {
    static var title: LocalizedStringResource = "Scan food"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        leaveControlRoute("scan")
        return .result()
    }
}

@available(iOS 18.0, *)
struct LogFoodControlIntent: AppIntent {
    static var title: LocalizedStringResource = "Log food"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        leaveControlRoute("search")
        return .result()
    }
}
