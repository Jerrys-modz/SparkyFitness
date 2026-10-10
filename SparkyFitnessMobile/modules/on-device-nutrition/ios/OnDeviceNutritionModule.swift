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
    @Guide(description: "Calories (kcal) PER SERVING, the number next to the word Calories, not a Daily Value")
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

@available(iOS 27, *)
@Generable
private struct MealItemEstimate {
    @Guide(description: "Plain food name, e.g. grilled chicken breast")
    let name: String
    @Guide(description: "Estimated weight of this item in grams, as served")
    let grams: Double
    @Guide(description: "Short portion description such as 1 cup or 2 slices")
    let portion: String
    @Guide(description: "Total calories (kcal) for this item at that weight")
    let calories: Double
    @Guide(description: "Protein in grams for this item at that weight")
    let protein: Double
    @Guide(description: "Total carbohydrate in grams for this item at that weight")
    let carbs: Double
    @Guide(description: "Total fat in grams for this item at that weight")
    let fat: Double
    @Guide(description: "Dietary fiber in grams for this item at that weight")
    let fiber: Double
    @Guide(description: "Total sugars in grams for this item at that weight")
    let sugar: Double
    @Guide(description: "How sure you are about this item: high, medium or low")
    let confidence: String
}

@available(iOS 27, *)
@Generable
private struct MealEstimate {
    @Guide(description: "One sentence describing the meal")
    let summary: String
    @Guide(description: "Each distinct food visible on the plate, at most 8")
    let items: [MealItemEstimate]
}

private let mealInstructions = """
You estimate the nutrition of a meal from a photo. List each distinct food you \
can see as its own item with an estimated weight in grams and the calories and \
macros for that weight. Use typical values for the food as prepared. If the user \
gives a total weight, make the item weights add up to it. Be conservative: do not \
add foods you cannot see, and use low confidence when unsure.
"""

private let extractionInstructions = """
You read nutrition facts labels. You are given the label's text, recognised \
line by line from the photo, and the photo itself. Copy numbers exactly as they \
appear in the text; use the photo only to tell which column or row a number \
belongs to. Prefer the PER SERVING column over %Daily Value and over per-100 \
columns unless only per-100 is printed. Never estimate or invent a value: leave \
a field empty when it is not printed. Do not copy a %Daily Value as a weight.
"""

@available(iOS 27, *)
@Generable
private struct SupplementIngredientExtraction {
    @Guide(description: "Ingredient name as printed, such as Vitamin C or Zinc, without the amount")
    let name: String
    @Guide(description: "Amount PER SERVING from the Amount Per Serving column, number only. Never the % Daily Value. Empty when only a percent is printed")
    let amount: Double?
    @Guide(description: "Unit printed beside the amount: mg, mcg, g, IU or kcal. Empty when none")
    let unit: String?
}

@available(iOS 27, *)
@Generable
private struct SupplementLabelExtraction {
    @Guide(description: "Product name if printed, else empty")
    let name: String?
    @Guide(description: "Brand if printed, else empty")
    let brand: String?
    @Guide(description: "One of tablet, capsule, softgel, gummy, powder, liquid when the package says so, else empty")
    let form: String?
    @Guide(description: "Serving size as printed, such as 2 Capsules")
    let serving: String?
    @Guide(description: "Every Supplement Facts line that has an amount per serving, in the order printed. Leave out lines that only show a % Daily Value, and inactive or other ingredients")
    let ingredients: [SupplementIngredientExtraction]
}

private let supplementInstructions = """
You read Supplement Facts panels. You are given the panel's text, recognised \
line by line from the photo, and the photo itself. Copy names, amounts and \
units exactly as they appear in the text; use the photo only to tell which \
column a number belongs to. Use the Amount Per Serving column, never % Daily \
Value. Never estimate or invent a value: leave a field empty when it is not \
printed.
"""

/// Text on the label, top to bottom, one recognised line per row. Run here
/// rather than left to the model's OCR tool so the numbers the model sees are
/// the printed ones, and so the caller can check the answer against them.
private func recognizeLabelText(in image: CGImage) -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // Language correction rewrites digits that look like letters, which is
    // wrong for a table of numbers.
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(cgImage: image)
    do {
        try handler.perform([request])
    } catch {
        return ""
    }
    let lines = (request.results ?? [])
        .sorted { $0.boundingBox.midY > $1.boundingBox.midY }
        .compactMap { $0.topCandidates(1).first?.string }
    return lines.joined(separator: "\n")
}
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
                let ocrText = recognizeLabelText(in: image)
                let session = LanguageModelSession(instructions: extractionInstructions)
                // Greedy: the same label should give the same numbers each time.
                let response = try await session.respond(
                    generating: NutritionLabelExtraction.self,
                    options: GenerationOptions(sampling: .greedy)
                ) {
                    "Label text:\n\(ocrText)\n\nExtract the nutrition facts from this label."
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
                    "ocr_text": ocrText,
                ]
            }
            #endif
            throw OnDeviceNutritionError.unavailable
        }

        // Estimates a meal from one photo. Returns a dictionary the JS side turns
        // into the server's estimate shape, or throws so the caller falls back.
        AsyncFunction("estimateMeal") { (base64: String, description: String?, totalGrams: Double?) -> [String: Any?] in
            #if compiler(>=6.4) && canImport(FoundationModels)
            if #available(iOS 27, *) {
                guard let data = Data(base64Encoded: base64),
                    let source = CGImageSourceCreateWithData(data as CFData, nil),
                    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
                else {
                    throw OnDeviceNutritionError.badImage
                }
                let session = LanguageModelSession(instructions: mealInstructions)
                var prompt = "Estimate the nutrition of this meal."
                if let description, !description.isEmpty {
                    prompt += " The user says: \(description)."
                }
                if let totalGrams, totalGrams > 0 {
                    prompt += " The whole meal weighs \(Int(totalGrams)) g."
                }
                let response = try await session.respond(
                    generating: MealEstimate.self,
                    options: GenerationOptions(sampling: .greedy)
                ) {
                    prompt
                    Attachment(image)
                }
                let meal = response.content
                return [
                    "summary": meal.summary,
                    "items": meal.items.map { item in
                        [
                            "name": item.name,
                            "grams": item.grams,
                            "portion": item.portion,
                            "calories": item.calories,
                            "protein": item.protein,
                            "carbs": item.carbs,
                            "fat": item.fat,
                            "fiber": item.fiber,
                            "sugar": item.sugar,
                            "confidence": item.confidence,
                        ] as [String: Any]
                    },
                ]
            }
            #endif
            throw OnDeviceNutritionError.unavailable
        }

        // Reads a Supplement Facts panel. The caller checks the answer against
        // `ocr_text` and falls back to the server's vision provider.
        AsyncFunction("scanSupplementLabel") { (base64: String) -> [String: Any?] in
            #if compiler(>=6.4) && canImport(FoundationModels)
            if #available(iOS 27, *) {
                guard let data = Data(base64Encoded: base64),
                    let source = CGImageSourceCreateWithData(data as CFData, nil),
                    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
                else {
                    throw OnDeviceNutritionError.badImage
                }
                let ocrText = recognizeLabelText(in: image)
                let session = LanguageModelSession(instructions: supplementInstructions)
                let response = try await session.respond(
                    generating: SupplementLabelExtraction.self,
                    options: GenerationOptions(sampling: .greedy)
                ) {
                    "Label text:\n\(ocrText)\n\nExtract the supplement facts from this label."
                    Attachment(image)
                }
                let r = response.content
                return [
                    "name": r.name ?? "",
                    "brand": r.brand ?? "",
                    "form": r.form,
                    "serving": r.serving,
                    "ingredients": r.ingredients.map { ingredient -> [String: Any?] in
                        ["name": ingredient.name, "amount": ingredient.amount, "unit": ingredient.unit]
                    },
                    "ocr_text": ocrText,
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
