import ExpoModulesCore
import Security

// Holds the server address, login and water container the "Log water" App
// Intent (plugins/ios/LogWater.swift) needs while the app is closed. The copy
// exists only while the user has switched "Log water without opening the app"
// on: JavaScript passes nil when it is switched off or the user signs out, which
// erases it. It lives in the Keychain, never in UserDefaults or a file.
//
// The service and account below must match plugins/ios/LogWater.swift.
private let backgroundWaterService = "com.sparkyapps.sparkyfitness.backgroundWater"
private let backgroundWaterAccount = "config"

public class BackgroundWaterModule: Module {
    public func definition() -> ModuleDefinition {
        Name("BackgroundWater")

        Function("setConfig") { (json: String?) -> Bool in
            let match: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: backgroundWaterService,
                kSecAttrAccount as String: backgroundWaterAccount,
            ]
            SecItemDelete(match as CFDictionary)
            guard let json, let data = json.data(using: .utf8) else { return true }
            var add = match
            add[kSecValueData as String] = data
            // Readable after the first unlock so a Shortcut run from the lock
            // screen still works; never copied to other devices.
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
        }
    }
}
