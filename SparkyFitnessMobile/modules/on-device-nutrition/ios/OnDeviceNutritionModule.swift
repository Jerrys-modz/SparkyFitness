import ExpoModulesCore
import ImageIO
import Foundation
#if canImport(FoundationModels)
import FoundationModels
import Vision  // OCRTool is a Vision-backed FoundationModels tool
#endif

// The Foundation Models image-attachment API ships with the iOS 27 SDK
// (Xcode 27, Swift 6.4). Older toolchains compile this module without the
// on-device path, and `isAvailable` then reports false so JS falls back to the
// server-side label scan.
#if compiler(>=6.4) && canImport(FoundationModels)
@available(iOS 27, *)
@Generable
private struct NutritionLabelExtraction {
    @Guide(description: "Product name if printed on the package, else empty")
    let name: String?
    @Guide(description: "Brand if printed on the package, else empty")
    let brand: String?
    @Guide(description: "Serving size amount, number only")
    let servingSize: Double?
    @Guide(description: "Serving size unit such as g, ml, oz, cup, piece")
    let servingUnit: String?
    @Guide(description: "Calories (kcal) PER SERVING")
    let calories: Double?
    @Guide(description: "Protein in grams per serving")
    let protein: Double?
    @Guide(description: "Total carbohydrate in grams per serving")
    let carbs: Double?
    @Guide(description: "Total fat in grams per serving")
    let fat: Double?
    @Guide(description: "Dietary fiber in grams per serving")
    let fiber: Double?
    @Guide(description: "Saturated fat in grams per serving")
    let saturatedFat: Double?
    @Guide(description: "Trans fat in grams per serving")
    let transFat: Double?
    @Guide(description: "Sodium in milligrams per serving")
    let sodium: Double?
    @Guide(description: "Total sugars in grams per serving")
    let sugars: Double?
    @Guide(description: "Cholesterol in milligrams per serving")
    let cholesterol: Double?
    @Guide(description: "Potassium in milligrams per serving")
    let potassium: Double?
    @Guide(description: "Calcium in milligrams per serving")
    let calcium: Double?
    @Guide(description: "Iron in milligrams per serving")
    let iron: Double?
    @Guide(description: "True when the printed values are per 100 g/ml instead of per serving")
    let valuesArePer100: Bool
}

private let extractionInstructions = """
You read nutrition facts labels from a photo. Copy numbers exactly as printed. \
Never estimate or invent a value: leave a field empty when it is not printed. \
Convert units to the ones requested in each field description. \
Use the OCR tool to read the printed text so numbers are copied exactly.
"""
#endif

public class OnDeviceNutritionModule: Module {
    public func definition() -> ModuleDefinition {
        Name("OnDeviceNutrition")

        Function("isAvailable") { () -> Bool in
            #if compiler(>=6.4) && canImport(FoundationModels)
            if #available(iOS 27, *) {
                if case .available = SystemLanguageModel.default.availability {
                    return true
                }
            }
            #endif
            return false
        }

        // Returns a dictionary shaped like the server's label-scan response, or
        // throws so the caller can fall back to the server.
        AsyncFunction("scanLabel") { (base64: String) -> [String: Any?] in
            #if compiler(>=6.4) && canImport(FoundationModels)
            if #available(iOS 27, *) {
                guard let data = Data(base64Encoded: base64),
                    let source = CGImageSourceCreateWithData(data as CFData, nil),
                    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
                else {
                    throw OnDeviceNutritionError.badImage
                }
                let session = LanguageModelSession(
                    tools: [OCRTool()],
                    instructions: extractionInstructions
                )
                let response = try await session.respond(
                    generating: NutritionLabelExtraction.self
                ) {
                    "Extract the nutrition facts from this label."
                    Attachment(image)
                }
                let r = response.content
                return [
                    "name": r.name ?? "",
                    "brand": r.brand ?? "",
                    "serving_size": r.servingSize,
                    "serving_unit": r.servingUnit,
                    "calories": r.calories,
                    "protein": r.protein,
                    "carbs": r.carbs,
                    "fat": r.fat,
                    "fiber": r.fiber,
                    "saturated_fat": r.saturatedFat,
                    "trans_fat": r.transFat,
                    "sodium": r.sodium,
                    "sugars": r.sugars,
                    "cholesterol": r.cholesterol,
                    "potassium": r.potassium,
                    "calcium": r.calcium,
                    "iron": r.iron,
                    "values_are_per_100": r.valuesArePer100,
                ]
            }
            #endif
            throw OnDeviceNutritionError.unavailable
        }
    }
}

enum OnDeviceNutritionError: Error {
    case unavailable
    case badImage
}
