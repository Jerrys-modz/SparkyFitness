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

private let chatInstructions = """
You are Sparky, a friendly nutrition and fitness assistant inside a food diary \
app, running on the user's phone. Answer briefly and practically. Use the \
diary snapshot for questions about today and never invent entries or numbers \
that are not in it. Use getDaySummary for other days. To log food, call \
searchFoods first, pick the best match, then call logFood; if the food is not \
in the library, call logQuickFood with your best estimate and say it is an \
estimate. Use logWater for water and logWeight for body weight. To fix a \
mistake, call listFoodEntries then deleteFoodEntry. Use getHistory for past \
weights or workouts. The user confirms every write, so just call the tool and then say in \
one short sentence what happened. If the user declines, accept it. Never claim \
something was logged unless the tool said so. You cannot edit entries, \
only delete them. You are not a doctor: for medical questions, suggest seeing a professional.
"""

private let extractionInstructions = """
You read nutrition facts labels. You are given the label's text, recognised \
line by line from the photo, and the photo itself. Copy numbers exactly as they \
appear in the text; use the photo only to tell which column or row a number \
belongs to. Prefer the PER SERVING column over %Daily Value and over per-100 \
columns unless only per-100 is printed. Never estimate or invent a value: leave \
a field empty when it is not printed. Do not copy a %Daily Value as a weight.
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

/// Hands a tool call from the on-device model to JavaScript and waits for the
/// answer. JS does the real work (search, confirm with the user, log) through
/// the same app APIs the buttons use, and replies with `resolveChatTool`.
final class ChatToolBridge {
    static let shared = ChatToolBridge()

    private let lock = NSLock()
    private var pending: [String: CheckedContinuation<String, Never>] = [:]
    var emit: ((_ id: String, _ name: String, _ argsJSON: String) -> Void)?

    func invoke(_ name: String, _ args: [String: Any]) async -> String {
        let id = UUID().uuidString
        let data = (try? JSONSerialization.data(withJSONObject: args)) ?? Data("{}".utf8)
        let json = String(data: data, encoding: .utf8) ?? "{}"
        return await withCheckedContinuation { continuation in
            lock.lock()
            pending[id] = continuation
            lock.unlock()
            if let emit = emit {
                emit(id, name, json)
            } else {
                resolve(id, "Tools are not available.")
            }
        }
    }

    func resolve(_ id: String, _ result: String) {
        lock.lock()
        let continuation = pending.removeValue(forKey: id)
        lock.unlock()
        continuation?.resume(returning: result)
    }
}

#if compiler(>=6.4) && canImport(FoundationModels)
@available(iOS 27, *)
private struct GetDaySummaryTool: Tool {
    let name = "getDaySummary"
    let description = "Reads the user's food diary summary for one day: calories and macros against goals, foods logged, water and workouts."

    @Generable
    struct Arguments {
        @Guide(description: "Date as YYYY-MM-DD. Leave empty for today.")
        let date: String
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, ["date": arguments.date])
    }
}

@available(iOS 27, *)
private struct SearchFoodsTool: Tool {
    let name = "searchFoods"
    let description = "Searches the user's food library by name. Returns numbered results; use the number with logFood."

    @Generable
    struct Arguments {
        @Guide(description: "Food name to search for, such as eggs or chicken breast")
        let query: String
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, ["query": arguments.query])
    }
}

@available(iOS 27, *)
private struct LogFoodTool: Tool {
    let name = "logFood"
    let description = "Logs a food from the latest searchFoods results to today's diary. The user is asked to confirm before anything is saved."

    @Generable
    struct Arguments {
        @Guide(description: "The result number from the latest searchFoods call")
        let resultNumber: Int
        @Guide(description: "Number of servings eaten, for example 1 or 1.5")
        let servings: Double
        @Guide(description: "Meal name such as Breakfast, Lunch, Dinner or Snacks")
        let meal: String
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(
            name,
            [
                "resultNumber": arguments.resultNumber,
                "servings": arguments.servings,
                "meal": arguments.meal,
            ]
        )
    }
}

@available(iOS 27, *)
private struct LogWeightTool: Tool {
    let name = "logWeight"
    let description = "Records the user's body weight in kilograms for today. The user is asked to confirm before it is saved."

    @Generable
    struct Arguments {
        @Guide(description: "Body weight in kilograms")
        let kilograms: Double
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, ["kilograms": arguments.kilograms])
    }
}
@available(iOS 27, *)
private struct LogQuickFoodTool: Tool {
    let name = "logQuickFood"
    let description = "Logs a food that is not in the library, from nutrition numbers you estimate, to today's diary. The user is asked to confirm before it is saved."

    @Generable
    struct Arguments {
        @Guide(description: "Name of the food or meal")
        let foodName: String
        @Guide(description: "Total calories (kcal) for what was eaten")
        let calories: Double
        @Guide(description: "Protein in grams for what was eaten")
        let protein: Double
        @Guide(description: "Carbohydrate in grams for what was eaten")
        let carbs: Double
        @Guide(description: "Fat in grams for what was eaten")
        let fat: Double
        @Guide(description: "Meal name such as Breakfast, Lunch, Dinner or Snacks")
        let meal: String
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(
            name,
            [
                "foodName": arguments.foodName,
                "calories": arguments.calories,
                "protein": arguments.protein,
                "carbs": arguments.carbs,
                "fat": arguments.fat,
                "meal": arguments.meal,
            ]
        )
    }
}

@available(iOS 27, *)
private struct LogWaterTool: Tool {
    let name = "logWater"
    let description = "Adds water to today's intake, in millilitres. The user is asked to confirm before it is saved."

    @Generable
    struct Arguments {
        @Guide(description: "Amount of water in millilitres, for example 250 or 500")
        let milliliters: Double
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, ["milliliters": arguments.milliliters])
    }
}

@available(iOS 27, *)
private struct ListFoodEntriesTool: Tool {
    let name = "listFoodEntries"
    let description = "Lists the foods logged on a day as numbered entries. Use it before deleteFoodEntry."

    @Generable
    struct Arguments {
        @Guide(description: "Date as YYYY-MM-DD. Leave empty for today.")
        let date: String
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, ["date": arguments.date])
    }
}

@available(iOS 27, *)
private struct DeleteFoodEntryTool: Tool {
    let name = "deleteFoodEntry"
    let description = "Deletes one food entry from the latest listFoodEntries result. The user is asked to confirm before it is deleted."

    @Generable
    struct Arguments {
        @Guide(description: "The entry number from the latest listFoodEntries call")
        let entryNumber: Int
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, ["entryNumber": arguments.entryNumber])
    }
}

@available(iOS 27, *)
private struct GetHistoryTool: Tool {
    let name = "getHistory"
    let description = "Reads recent history: body weight entries or workouts over the last few days."

    @Generable
    struct Arguments {
        @Guide(description: "Either weight or workouts")
        let kind: String
        @Guide(description: "How many days back to look, 1 to 30")
        let days: Int
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, ["kind": arguments.kind, "days": arguments.days])
    }
}
#endif

public class OnDeviceNutritionModule: Module {
    public func definition() -> ModuleDefinition {
        Name("OnDeviceNutrition")

        Events("onChatTool")

        OnCreate {
            ChatToolBridge.shared.emit = { [weak self] id, name, args in
                self?.sendEvent("onChatTool", ["id": id, "name": name, "args": args])
            }
        }

        Function("resolveChatTool") { (id: String, result: String) in
            ChatToolBridge.shared.resolve(id, result)
        }

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

        // Answers a chat turn from the transcript and a read-only diary
        // snapshot. Plain text, no tools: it cannot change anything.
        AsyncFunction("chat") { (transcript: String, context: String) -> String in
            #if compiler(>=6.4) && canImport(FoundationModels)
            if #available(iOS 27, *) {
                let session = LanguageModelSession(
                    tools: [
                        GetDaySummaryTool(), SearchFoodsTool(), LogFoodTool(), LogQuickFoodTool(),
                        LogWaterTool(), LogWeightTool(), ListFoodEntriesTool(), DeleteFoodEntryTool(),
                        GetHistoryTool(),
                    ],
                    instructions: chatInstructions
                )
                let response = try await session.respond(
                    to: "Today's diary:\n\(context)\n\nConversation so far:\n\(transcript)\n\nReply to the user's last message."
                )
                return response.content
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
    }
}

enum OnDeviceNutritionError: Error {
    case unavailable
    case badImage
}
