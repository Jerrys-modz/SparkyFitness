import AppIntents
import Foundation

// Makes SparkyFitness a result in iOS Visual Intelligence. The user captures a
// meal, SparkyFitness shows "Log this meal", and tapping it opens the app with
// that photo. Apple passes the captured image but no analysis, so the numbers
// still come from the app's own estimate.
//
// This file is added to the app target by plugins/withVisualIntelligence.ts: an
// intent has to be in the app target to be discovered. The handoff to
// JavaScript is modules/visual-intelligence; the key and folder below must
// match its.
#if canImport(VisualIntelligence)
import CoreImage
import VisualIntelligence

private let visualIntelligencePendingKey = "sparky.visualIntelligence.pending"
private let visualIntelligenceFolder = "visual-intelligence"

@available(iOS 26.0, *)
enum VisualIntelligenceHandoff {
    /// Writes the captured image as a JPEG in the caches directory and returns
    /// its file name, or nil when it cannot be encoded.
    static func save(_ readOnlyBuffer: CVReadOnlyPixelBuffer) -> String? {
        let data: Data? = readOnlyBuffer.withUnsafeBuffer { buffer in
            let image = CIImage(cvPixelBuffer: buffer)
            guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
            return CIContext().jpegRepresentation(
                of: image,
                colorSpace: colorSpace,
                options: [:]
            )
        }
        guard
            let data,
            let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        else { return nil }
        let folder = caches.appendingPathComponent(visualIntelligenceFolder, isDirectory: true)
        let fileName = "\(UUID().uuidString).jpg"
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: folder.appendingPathComponent(fileName), options: .atomic)
        } catch {
            return nil
        }
        return fileName
    }

    /// Leaves a note for the JavaScript side to pick up when the app opens.
    static func setPending(fileName: String) {
        UserDefaults.standard.set(
            ["file": fileName, "at": Date().timeIntervalSince1970],
            forKey: visualIntelligencePendingKey
        )
    }
}

@available(iOS 26.0, *)
struct MealPhotoEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Meal photo")
    }
    static var defaultQuery: MealPhotoEntityQuery { MealPhotoEntityQuery() }

    /// The saved photo's file name.
    var id: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "Log this meal in SparkyFitness",
            subtitle: "Estimate calories and macros"
        )
    }
}

@available(iOS 26.0, *)
struct MealPhotoEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [MealPhotoEntity] {
        identifiers.map { MealPhotoEntity(id: $0) }
    }
}

/// Called by Visual Intelligence with what the camera captured.
@available(iOS 26.0, *)
struct MealPhotoValueQuery: IntentValueQuery {
    func values(for input: SemanticContentDescriptor) async throws -> [MealPhotoEntity] {
        guard
            let buffer = input.pixelBuffer,
            let fileName = VisualIntelligenceHandoff.save(buffer)
        else { return [] }
        return [MealPhotoEntity(id: fileName)]
    }
}

/// Runs when the user taps the SparkyFitness result.
@available(iOS 26.0, *)
struct LogMealPhotoIntent: OpenIntent {
    static var title: LocalizedStringResource { "Log meal photo" }

    @Parameter(title: "Meal photo")
    var target: MealPhotoEntity

    func perform() async throws -> some IntentResult {
        VisualIntelligenceHandoff.setPending(fileName: target.id)
        return .result()
    }
}
#endif
