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
    @Guide(description: "Specific name of the food as it looks in the photo, including how it is cooked and any visible brand, e.g. pan-seared chicken thigh with skin, or Oikos Triple Zero vanilla yogurt")
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
You estimate the nutrition of a meal from one or more photos. List each distinct \
food you can see as its own item with an estimated weight in grams and the \
calories and macros for that weight.

QUANTITY
- Estimate the amount actually shown, not a typical serving. "2 eggs" is about \
100 g in total, and every nutrient must cover the whole amount.
- If the user gives a total weight, make the item weights add up to it.

IDENTIFY WHAT IS ACTUALLY THERE
- Look at the photo before you decide. Describe each food by what you can see \
(shape, colour, cooking method, toppings, packaging), not by what a plate like \
this usually holds. Do not fall back on a stock meal such as eggs, bacon or \
toast because it is breakfast time.
- Read any brand, product name or label on packaging, cups, wrappers or \
menus and use that product's real values.
- Count and measure: use the number of pieces and their size relative to the \
plate, utensils or hands. Avoid round placeholder weights like 30 g or 120 g \
unless that is genuinely what you see.
- If you cannot tell what a food is, name your best specific guess and mark \
the item low confidence.

PHOTOS
- Use every photo once. Several photos usually show the same meal from \
different angles: do not count the same food twice.
- Read any scale display or package label that is visible and prefer those \
numbers over a visual guess.

ACCURACY
- Use typical values for the food as prepared, or the known values for a named \
brand or product.
- Calories must be consistent with the macros: about protein x 4 + carbs x 4 + \
fat x 9, within 5%.
- Be conservative: do not add foods you cannot see, and use low confidence when \
unsure.
"""

private let chatInstructions = """
You are Sparky, a friendly nutrition and fitness assistant inside a food diary \
app, running on the user's phone. Answer briefly and practically. Use the \
diary snapshot for questions about the day and never invent entries or numbers \
that are not in it. The snapshot already holds the finished figures, such as \
"Calories remaining"; quote them as they are and never add or subtract \
numbers yourself. Write every answer fresh from the snapshot and tool results: never reuse \
wording, headings or openings from earlier replies in the conversation. When \
asked for changes, advice or how things are going, give one or two concrete \
points from the numbers and never say you cannot suggest anything. Use getDaySummary for other days, \
and for several recent days when asked how food has been going over time. To log food, call \
searchFoods first, pick the best match, then call logFood; if the food is not \
in the library, call logQuickFood with your best estimate and say it is an \
estimate. Use logWater for water and logWeight for body weight. To fix a \
mistake, call listFoodEntries then deleteFoodEntry. Use getHistory for past \
weights or workouts, getSleep for sleep, and getFasting, startFast and endFast \
for fasting. Use logExercise for a finished activity and copyMeal to repeat an \
earlier meal. Only call a logging, deleting or fasting tool when the user clearly says \
they ate, drank, weighed, exercised or want that action done. For suggestions, \
ideas, recipes or advice, answer in text and call no write tool. \
The user confirms every write, so just call the tool and then say in \
one short sentence what happened. If the user declines, accept it. Never claim \
something was logged unless the tool said so. You cannot edit entries, \
only delete them. You are not a doctor: for medical questions, suggest seeing a professional.
"""

private let serverChatInstructions = """
You are Sparky, a friendly nutrition and fitness assistant inside a food diary \
app, running on the user's phone. Answer briefly and practically. The diary \
snapshot already holds finished figures, such as "Calories remaining"; quote \
them as they are and never add or subtract numbers yourself. Write every answer fresh from the snapshot and tool results: never reuse \
wording, headings or openings from earlier replies in the conversation. When \
asked for changes, advice or how things are going, give one or two concrete \
points from the numbers and never say you cannot suggest anything. For trends over time, read several \
recent days with the tools. Use the tools you \
are given to read the user's data or to log, change or delete it, and only call \
a tool that changes data when the user clearly asks for that change. For \
suggestions, ideas, recipes or advice, answer in text and call no tool that \
changes data. The user is asked to approve every change, so just call the tool \
and then say in one short sentence what happened. If the user declines, accept \
it. Never claim something was done unless the tool said so. If no tool fits, \
say so. You are not a doctor: for medical questions, suggest seeing a professional.
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
    let description = "Logs a food the user says they ate that is not in the library, from nutrition numbers you estimate, to today's diary. Never use it for suggestions. The user is asked to confirm before it is saved."

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
@available(iOS 27, *)
private struct GetFastingTool: Tool {
    let name = "getFasting"
    let description = "Reads whether the user is fasting right now and for how long."

    @Generable
    struct Arguments {
        @Guide(description: "Always empty")
        let unused: String
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, [:])
    }
}

@available(iOS 27, *)
private struct StartFastTool: Tool {
    let name = "startFast"
    let description = "Starts a fast now with a target length in hours. The user is asked to confirm."

    @Generable
    struct Arguments {
        @Guide(description: "Target length of the fast in hours, for example 16")
        let hours: Double
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, ["hours": arguments.hours])
    }
}

@available(iOS 27, *)
private struct EndFastTool: Tool {
    let name = "endFast"
    let description = "Ends the fast that is running now. The user is asked to confirm."

    @Generable
    struct Arguments {
        @Guide(description: "Always empty")
        let unused: String
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, [:])
    }
}

@available(iOS 27, *)
private struct GetSleepTool: Tool {
    let name = "getSleep"
    let description = "Reads recent sleep: hours asleep and score for each night."

    @Generable
    struct Arguments {
        @Guide(description: "How many nights back to look, 1 to 14")
        let days: Int
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(name, ["days": arguments.days])
    }
}

@available(iOS 27, *)
private struct LogExerciseTool: Tool {
    let name = "logExercise"
    let description = "Logs a finished activity such as a run or a walk to today's diary. The user is asked to confirm."

    @Generable
    struct Arguments {
        @Guide(description: "Activity name, such as Running or Walking")
        let activity: String
        @Guide(description: "Duration in minutes")
        let minutes: Double
        @Guide(description: "Calories burned, or 0 if unknown")
        let caloriesBurned: Double
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(
            name,
            [
                "activity": arguments.activity,
                "minutes": arguments.minutes,
                "caloriesBurned": arguments.caloriesBurned,
            ]
        )
    }
}

@available(iOS 27, *)
private struct CopyMealTool: Tool {
    let name = "copyMeal"
    let description = "Copies everything logged in one meal on an earlier day into a meal today. The user is asked to confirm."

    @Generable
    struct Arguments {
        @Guide(description: "Either yesterday or a date as YYYY-MM-DD")
        let fromDay: String
        @Guide(description: "Meal to copy from, such as Breakfast")
        let fromMeal: String
        @Guide(description: "Meal today to copy into, such as Breakfast")
        let toMeal: String
    }

    func call(arguments: Arguments) async throws -> String {
        await ChatToolBridge.shared.invoke(
            name,
            [
                "fromDay": arguments.fromDay,
                "fromMeal": arguments.fromMeal,
                "toMeal": arguments.toMeal,
            ]
        )
    }
}
@available(iOS 27, *)
private func dynamicSchema(from json: [String: Any], name: String, description: String?, depth: Int = 0) -> DynamicGenerationSchema {
    if let values = json["enum"] as? [Any] {
        let strings = values.compactMap { $0 as? String }
        if !strings.isEmpty {
            return DynamicGenerationSchema(name: name, description: description, anyOf: strings)
        }
    }
    for key in ["anyOf", "oneOf"] {
        if let options = json[key] as? [[String: Any]],
            let first = options.first(where: { ($0["type"] as? String) != "null" }) {
            return dynamicSchema(from: first, name: name, description: description, depth: depth)
        }
    }
    var type = json["type"] as? String
    if type == nil, let types = json["type"] as? [String] {
        type = types.first(where: { $0 != "null" })
    }
    // Deep nesting costs the small model more than it helps; flatten to text.
    if depth >= 3 { return DynamicGenerationSchema(type: String.self) }
    switch type {
    case "object":
        let props = (json["properties"] as? [String: Any]) ?? [:]
        let required = Set((json["required"] as? [String]) ?? [])
        let properties = props.keys.sorted().map { key -> DynamicGenerationSchema.Property in
            let child = (props[key] as? [String: Any]) ?? [:]
            return DynamicGenerationSchema.Property(
                name: key,
                description: child["description"] as? String,
                schema: dynamicSchema(from: child, name: "\(name)_\(key)", description: nil, depth: depth + 1),
                isOptional: !required.contains(key)
            )
        }
        return DynamicGenerationSchema(name: name, description: description, properties: properties)
    case "array":
        let items = (json["items"] as? [String: Any]) ?? ["type": "string"]
        return DynamicGenerationSchema(
            arrayOf: dynamicSchema(from: items, name: "\(name)_item", description: nil, depth: depth + 1)
        )
    case "integer":
        return DynamicGenerationSchema(type: Int.self)
    case "number":
        return DynamicGenerationSchema(type: Double.self)
    case "boolean":
        return DynamicGenerationSchema(type: Bool.self)
    default:
        return DynamicGenerationSchema(type: String.self)
    }
}

/// A tool the server lends: its definition arrives as JSON at run time, and a
/// call is relayed back to JavaScript, which runs it on the server.
@available(iOS 27, *)
private struct ServerProxyTool: Tool {
    typealias Arguments = GeneratedContent
    typealias Output = String

    let name: String
    let description: String
    let parameters: GenerationSchema

    init?(name: String, description: String, schemaJSON: String) {
        guard let data = schemaJSON.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        var root = json
        // The model is always given an object; wrap anything else.
        if (root["type"] as? String) != "object" {
            root = ["type": "object", "properties": [String: Any]()]
        }
        let schema = dynamicSchema(from: root, name: "Args", description: nil)
        guard let built = try? GenerationSchema(root: schema, dependencies: []) else { return nil }
        self.name = name
        self.description = description
        self.parameters = built
    }

    func call(arguments: GeneratedContent) async throws -> String {
        await ChatToolBridge.shared.invoke("server:" + name, ["args": arguments.jsonString])
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

        // Why the on-device model can or cannot be used: "available",
        // "deviceNotEligible", "appleIntelligenceNotEnabled", "modelNotReady"
        // or "unsupported" (older than iOS 27).
        Function("onDeviceStatus") { () -> String in
            #if compiler(>=6.4) && canImport(FoundationModels)
            if #available(iOS 27, *) {
                switch SystemLanguageModel.default.availability {
                case .available:
                    return "available"
                case .unavailable(.deviceNotEligible):
                    return "deviceNotEligible"
                case .unavailable(.appleIntelligenceNotEnabled):
                    return "appleIntelligenceNotEnabled"
                case .unavailable(.modelNotReady):
                    return "modelNotReady"
                default:
                    return "unsupported"
                }
            }
            #endif
            return "unsupported"
        }

        // Which on-device model is in use and how big its window is, such as
        // "Apple Foundation Advanced" and 8192. Empty without Apple Intelligence.
        Function("onDeviceModelInfo") { () -> [String: String] in
            #if compiler(>=6.4) && canImport(FoundationModels)
            if #available(iOS 27, *) {
                let model = SystemLanguageModel.default
                return [
                    "name": model.variant.displayName,
                    "contextSize": String(model.contextSize),
                ]
            }
            #endif
            return [:]
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

        // The built-in system prompt, so the settings screen can show it and
        // reset an edited copy back to it.
        Function("defaultChatInstructions") { () -> String in
            #if compiler(>=6.4) && canImport(FoundationModels)
            return chatInstructions
            #else
            return ""
            #endif
        }

        // Whether Apple's private servers can be used for chat right now:
        // "available", "quotaLimitReached", "deviceNotEligible",
        // "systemNotReady" or "unsupported".
        Function("cloudChatStatus") { () -> String in
            #if compiler(>=6.4) && canImport(FoundationModels)
            if #available(iOS 27, *) {
                let cloud = PrivateCloudComputeLanguageModel()
                switch cloud.availability {
                case .available:
                    return cloud.quotaUsage.isLimitReached ? "quotaLimitReached" : "available"
                case .unavailable(let reason):
                    return reason == .deviceNotEligible ? "deviceNotEligible" : "systemNotReady"
                }
            }
            #endif
            return "unsupported"
        }

        // Answers a chat turn from the transcript and a read-only diary
        // snapshot. Options: `instructions` (system prompt override),
        // `greedy` (repeatable replies), `disabledTools` (names to leave out),
        // `model` ("device", "auto" or "cloud"). Returns the reply and the
        // model that produced it.
        AsyncFunction("chat") { (transcript: String, context: String, options: [String: Any]) -> [String: String] in
            #if compiler(>=6.4) && canImport(FoundationModels)
            if #available(iOS 27, *) {
                let custom = (options["instructions"] as? String) ?? ""
                let greedy = (options["greedy"] as? Bool) ?? false
                let disabled = Set((options["disabledTools"] as? [String]) ?? [])
                let mode = (options["model"] as? String) ?? "device"
                let allTools: [any Tool] = [
                    GetDaySummaryTool(), SearchFoodsTool(), LogFoodTool(), LogQuickFoodTool(),
                    LogWaterTool(), LogWeightTool(), ListFoodEntriesTool(), DeleteFoodEntryTool(),
                    GetHistoryTool(), GetFastingTool(), StartFastTool(), EndFastTool(),
                    GetSleepTool(), LogExerciseTool(), CopyMealTool(),
                ]
                var tools = allTools.filter { !disabled.contains($0.name) }
                var usingServerTools = false
                var toolsKept = ""
                // Tools lent by the server replace the built-in ones.
                if let lent = options["serverTools"] as? [[String: Any]], !lent.isEmpty {
                    var proxies: [any Tool] = []
                    for def in lent {
                        guard let toolName = def["name"] as? String,
                            !disabled.contains(toolName),
                            let schemaJSON = def["parameters"] as? String,
                            let tool = ServerProxyTool(
                                name: toolName,
                                description: (def["description"] as? String) ?? "",
                                schemaJSON: schemaJSON
                            )
                        else { continue }
                        proxies.append(tool)
                    }
                    if !proxies.isEmpty {
                        // The model's window is small: keep tools, in the order
                        // given, while their definitions fit the budget, and skip
                        // any that would not.
                        let budget = (options["toolBudget"] as? Int) ?? 2500
                        var kept: [any Tool] = []
                        for proxy in proxies.prefix(60) {
                            let trial = kept + [proxy]
                            if let used = try? await SystemLanguageModel.default.tokenCount(for: trial),
                                used > budget {
                                continue
                            }
                            kept = trial
                        }
                        toolsKept = "\(kept.count)/\(proxies.count)"
                        if !kept.isEmpty {
                            tools = kept
                            usingServerTools = true
                        }
                    }
                }
                let finalTools = tools
                var instructions = custom.isEmpty
                    ? (usingServerTools ? serverChatInstructions : chatInstructions)
                    : custom
                if let userContext = options["userContext"] as? String, !userContext.isEmpty {
                    instructions += "\n\nNOTES FROM THE USER\n\(userContext)"
                }
                let finalInstructions = instructions
                let prompt = context.isEmpty
                    ? "Conversation so far:\n\(transcript)\n\nReply to the user's last message."
                    : "Diary:\n\(context)\n\nConversation so far:\n\(transcript)\n\nReply to the user's last message."

                func run(_ model: some LanguageModel) async throws -> String {
                    let session = LanguageModelSession(model: model, tools: finalTools, instructions: finalInstructions)
                    let response = try await session.respond(
                        to: prompt,
                        options: greedy ? GenerationOptions(sampling: .greedy) : GenerationOptions()
                    )
                    return response.content
                }

                let toolTokens = (try? await SystemLanguageModel.default.tokenCount(for: finalTools)).map { String($0) } ?? ""
                if mode == "cloud" {
                    return ["text": try await run(PrivateCloudComputeLanguageModel()), "model": "cloud", "toolTokens": toolTokens, "toolsKept": toolsKept]
                }
                if mode == "auto" {
                    do {
                        return ["text": try await run(SystemLanguageModel.default), "model": "device", "toolTokens": toolTokens, "toolsKept": toolsKept]
                    } catch let error as LanguageModelError {
                        // Only a conversation too big for the small model moves
                        // to the private servers; nothing has run yet.
                        guard case .contextSizeExceeded = error else { throw error }
                        return ["text": try await run(PrivateCloudComputeLanguageModel()), "model": "cloud", "toolTokens": toolTokens, "toolsKept": toolsKept]
                    }
                }
                return ["text": try await run(SystemLanguageModel.default), "model": "device", "toolTokens": toolTokens, "toolsKept": toolsKept]
            }
            #endif
            throw OnDeviceNutritionError.unavailable
        }

        // Estimates a meal from one photo. Returns a dictionary the JS side turns
        // into the server's estimate shape, or throws so the caller falls back.
        AsyncFunction("estimateMeal") { (images64: [String], description: String?, totalGrams: Double?, userContext: String?) -> [String: Any?] in
            #if compiler(>=6.4) && canImport(FoundationModels)
            if #available(iOS 27, *) {
                var images: [CGImage] = []
                for base64 in images64 {
                    guard let data = Data(base64Encoded: base64),
                        let source = CGImageSourceCreateWithData(data as CFData, nil),
                        let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
                    else {
                        throw OnDeviceNutritionError.badImage
                    }
                    images.append(image)
                }
                guard !images.isEmpty else { throw OnDeviceNutritionError.badImage }
                var instructions = mealInstructions
                if let userContext, !userContext.isEmpty {
                    instructions += "\n\nNOTES FROM THE USER\n\(userContext)"
                }
                let session = LanguageModelSession(instructions: instructions)
                var prompt = images.count == 1
                    ? "Estimate the nutrition of this meal."
                    : "Estimate the nutrition of this one meal, shown in \(images.count) photos."
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
                    for (index, image) in images.enumerated() {
                        Attachment(image).label("image-\(index)")
                    }
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
