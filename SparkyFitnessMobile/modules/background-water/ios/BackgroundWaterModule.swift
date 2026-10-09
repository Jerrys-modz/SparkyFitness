import ExpoModulesCore
import Security

// Holds the server address, login, weight unit and water container the Siri and
// Shortcuts App Intents (plugins/ios/ShortcutActions.swift) need while the app
// is closed. The copy exists while a server is signed in: JavaScript passes nil
// when the user signs out or removes the server, which erases it. It lives in
// the Keychain, never in UserDefaults or a file.
//
// The service and account below must match plugins/ios/ShortcutActions.swift.
private let backgroundWaterService = "com.sparkyapps.sparkyfitness.backgroundWater"
private let backgroundWaterAccount = "config"

/// The Keychain group the app shares with the widget extension, so Lock Screen
/// and Control Center controls can read the copy. Filled in at build time from
/// Info.plist; nil in a build without it, where only the app can read it.
private func sharedKeychainGroup() -> String? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "SparkyKeychainGroup") as? String,
          !group.isEmpty, !group.contains("$(") else { return nil }
    return group
}

public class BackgroundWaterModule: Module {
    public func definition() -> ModuleDefinition {
        Name("BackgroundWater")

        Function("setConfig") { (json: String?) -> Bool in
            let match: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: backgroundWaterService,
                kSecAttrAccount as String: backgroundWaterAccount,
            ]
            // Remove any copy from before the shared group existed, then the
            // current one.
            SecItemDelete(match as CFDictionary)
            var current = match
            if let group = sharedKeychainGroup() {
                current[kSecAttrAccessGroup as String] = group
                SecItemDelete(current as CFDictionary)
            }
            guard let json, let data = json.data(using: .utf8) else { return true }
            var add = current
            add[kSecValueData as String] = data
            // Readable after the first unlock so a Shortcut run from the lock
            // screen still works; never copied to other devices.
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
        }
    }
}
