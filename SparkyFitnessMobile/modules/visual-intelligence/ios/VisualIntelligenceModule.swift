import ExpoModulesCore
import Foundation

// The App Intents that receive the photo live in the app target (see
// plugins/withVisualIntelligence.ts and plugins/ios/VisualIntelligence.swift):
// an intent's metadata is only picked up from the app target. They write the
// photo into the caches directory and leave a note in UserDefaults; this module
// lets JavaScript pick that note up once. The keys and folder name must match
// the ones in VisualIntelligence.swift.
private let pendingKey = "sparky.visualIntelligence.pending"
private let folderName = "visual-intelligence"
// A photo older than this is from an earlier tap that was never opened.
private let maxAge: TimeInterval = 10 * 60

public class VisualIntelligenceModule: Module {
    public func definition() -> ModuleDefinition {
        Name("VisualIntelligence")

        // The absolute path of the photo the last Visual Intelligence result
        // handed over, or nil when there is none or it is stale. Returns each
        // photo once.
        Function("consumePendingImage") { () -> String? in
            let defaults = UserDefaults.standard
            guard let note = defaults.dictionary(forKey: pendingKey) else { return nil }
            defaults.removeObject(forKey: pendingKey)
            guard
                let fileName = note["file"] as? String,
                let at = note["at"] as? Double,
                Date().timeIntervalSince1970 - at <= maxAge,
                let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            else { return nil }
            let path = caches
                .appendingPathComponent(folderName, isDirectory: true)
                .appendingPathComponent(fileName)
                .path
            return FileManager.default.fileExists(atPath: path) ? path : nil
        }
    }
}
