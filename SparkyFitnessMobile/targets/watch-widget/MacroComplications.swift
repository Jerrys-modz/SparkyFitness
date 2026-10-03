import WidgetKit
import SwiftUI

// Protein, Carbs and Fat complications. They read the same `energyGoalSnapshot`
// the Daily Energy Goal ring decodes (ComplicationPublisher writes it), so no
// new data path exists: each is a single fraction of today's goal. Helpers are
// file-private for the reason spelled out at the top of WaterGoalComplication.

private let macroDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

enum MacroKind {
    case protein, carbs, fat

    var kind: String {
        switch self {
        case .protein: return "proteinGoalComplication"
        case .carbs: return "carbsGoalComplication"
        case .fat: return "fatGoalComplication"
        }
    }

    var name: String {
        switch self {
        case .protein: return "Protein"
        case .carbs: return "Carbs"
        case .fat: return "Fat"
        }
    }

    var letter: String {
        switch self {
        case .protein: return "P"
        case .carbs: return "C"
        case .fat: return "F"
        }
    }

    var symbol: String {
        switch self {
        case .protein: return "fish.fill"
        case .carbs: return "leaf.fill"
        case .fat: return "drop.fill"
        }
    }

    /// Matches the macro colours in targets/watch's GoalPalette.
    var tint: Color {
        switch self {
        case .protein: return .red
        case .carbs: return .yellow
        case .fat: return .blue
        }
    }
}

private struct MacroSnapshotPayload: Decodable {
    let date: String?
    let proteinGoalProgress: Double?
    let carbsGoalProgress: Double?
    let fatGoalProgress: Double?
}

private func loadMacroProgress(_ macro: MacroKind) -> Double {
    guard
        let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let data = defaults.data(forKey: "energyGoalSnapshot"),
        let payload = try? JSONDecoder().decode(MacroSnapshotPayload.self, from: data),
        payload.date == macroDateFormatter.string(from: Date())
    else { return 0 }
    let value: Double?
    switch macro {
    case .protein: value = payload.proteinGoalProgress
    case .carbs: value = payload.carbsGoalProgress
    case .fat: value = payload.fatGoalProgress
    }
    return max(0, min(1, value ?? 0))
}

struct MacroEntry: TimelineEntry {
    let date: Date
    let progress: Double
}

struct MacroProvider: TimelineProvider {
    let macro: MacroKind

    func placeholder(in context: Context) -> MacroEntry {
        MacroEntry(date: Date(), progress: 0.6)
    }

    func getSnapshot(in context: Context, completion: @escaping (MacroEntry) -> Void) {
        completion(MacroEntry(date: Date(), progress: loadMacroProgress(macro)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MacroEntry>) -> Void) {
        let now = Date()
        let entry = MacroEntry(date: now, progress: loadMacroProgress(macro))
        let in15Minutes = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now
        let nextMidnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? in15Minutes
        completion(Timeline(entries: [entry], policy: .after(min(in15Minutes, nextMidnight))))
    }
}

struct MacroComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let macro: MacroKind
    let entry: MacroEntry

    private var percent: Int { Int((entry.progress * 100).rounded()) }

    var body: some View {
        content
            .widgetURL(ComplicationLink.goals.url)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(macro.name) \(percent)% of goal.")
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCorner:
            Image(systemName: macro.symbol)
                .font(.title3)
                .foregroundStyle(macro.tint)
                .widgetLabel {
                    ProgressView(value: entry.progress)
                        .tint(macro.tint)
                }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label(macro.name, systemImage: macro.symbol)
                    .font(.headline)
                    .foregroundStyle(macro.tint)
                Text("\(percent)% of goal")
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                ProgressView(value: entry.progress)
                    .tint(macro.tint)
            }
        case .accessoryInline:
            Label("\(macro.name) \(percent)%", systemImage: macro.symbol)
        default:
            Gauge(value: entry.progress) {
                Text(macro.letter)
            } currentValueLabel: {
                Text("\(percent)")
                    .monospacedDigit()
            }
            .gaugeStyle(.accessoryCircular)
            .tint(macro.tint)
        }
    }
}

private func macroConfiguration(_ macro: MacroKind) -> some WidgetConfiguration {
    StaticConfiguration(kind: macro.kind, provider: MacroProvider(macro: macro)) { entry in
        MacroComplicationView(macro: macro, entry: entry)
            .containerBackground(.clear, for: .widget)
    }
    .configurationDisplayName("\(macro.name) Goal")
    .description("How much of today's \(macro.name.lowercased()) goal you've reached.")
    .supportedFamilies([
        .accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline,
    ])
}

struct ProteinGoalComplication: Widget {
    var body: some WidgetConfiguration { macroConfiguration(.protein) }
}

struct CarbsGoalComplication: Widget {
    var body: some WidgetConfiguration { macroConfiguration(.carbs) }
}

struct FatGoalComplication: Widget {
    var body: some WidgetConfiguration { macroConfiguration(.fat) }
}
