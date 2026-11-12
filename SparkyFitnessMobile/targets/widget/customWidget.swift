import AppIntents
import SwiftUI
import WidgetKit

// The custom widget. The person picks its numbers, style and color in the
// widget's own Edit Widget screen (the intent below), so there is nothing saved
// in the app to choose from. The app writes today's figure for every metric as
// a JSON string in the app group (`customWidgetData`, by `useWidgetSync`); its
// shape is the `WidgetDataSnapshot` contract in shared/src/utils/widgetLayout.ts.
// The widget in turn stamps `customWidgetActiveAt` each time iOS asks it for a
// timeline, so the app knows one is on a screen and fetches the extra figures.
//
// Everything here reads leniently: an unknown metric or style from a newer app
// is skipped, never a crash, because the widget extension and the app update
// independently.

// MARK: - Models

struct CustomMetricValue: Decodable {
    let value: Double
    let goal: Double?
    let progress: Double?
    let unit: String
}

struct CustomWidgetData: Decodable {
    let date: String?
    let lastUpdated: Double?
    let energyUnit: String?
    let metrics: [String: CustomMetricValue]
    /// Where tapping each number opens the app: a path under the app's link
    /// scheme, sent by the app (WIDGET_METRIC_LINK_PATHS). Absent from a
    /// snapshot written by an older app.
    let links: [String: String]?

    static let empty = CustomWidgetData(date: nil, lastUpdated: nil, energyUnit: nil, metrics: [:], links: nil)
}

/// What the person picked in Edit Widget, as plain values the renderer reads.
struct CustomWidgetConfig {
    /// Metric ids in the order picked; empty slots are already left out.
    let metrics: [String]
    /// A style name, or "auto" for the placed size's default.
    let style: String
    let accent: String
    let largeText: Bool
}

// MARK: - Loading

/// The storage writes a string for the JSON this key holds; a build that
/// stored it as data is read too.
private func readCustomJSON(_ key: String) -> Data? {
    guard
        let appGroup = appGroupIdentifier(),
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup)
    else {
        return nil
    }
    if let string = defaults.string(forKey: key) {
        return string.data(using: .utf8)
    }
    return defaults.data(forKey: key)
}

func loadCustomWidgetData() -> CustomWidgetData {
    guard
        let data = readCustomJSON("customWidgetData"),
        let payload = try? JSONDecoder().decode(CustomWidgetData.self, from: data),
        isToday(payload.date)
    else {
        return .empty
    }
    return payload
}

/// Tells the app a custom widget is on a screen (iOS only asks for a timeline
/// while one is). The app reads this to decide whether to fetch the extra
/// figures, and treats a stamp older than two days as no widget.
private func markCustomWidgetActive() {
    guard
        let appGroup = appGroupIdentifier(),
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup)
    else {
        return
    }
    defaults.set(Int(Date().timeIntervalSince1970), forKey: "customWidgetActiveAt")
}

// MARK: - Families, styles, metrics

// Mirrors WIDGET_FAMILY_MAX_METRICS and WIDGET_FAMILY_STYLES in
// shared/src/utils/widgetLayout.ts. The first style of a family is its default.
private let customFamilyMaxMetrics: [String: Int] = [
    "small": 2, "medium": 4, "large": 8,
    "lockCircular": 1, "lockRectangular": 3, "lockInline": 1,
]

private let customFamilyStyles: [String: [String]] = [
    "small": ["ring", "value", "bars"],
    "medium": ["grid", "bars", "ring", "list"],
    "large": ["list", "grid", "bars"],
    "lockCircular": ["ring", "value"],
    "lockRectangular": ["bars", "list"],
    "lockInline": ["value"],
]

private func customFamilyKey(_ family: WidgetFamily) -> String? {
    switch family {
    case .systemSmall: return "small"
    case .systemMedium: return "medium"
    case .systemLarge: return "large"
    case .accessoryCircular: return "lockCircular"
    case .accessoryRectangular: return "lockRectangular"
    case .accessoryInline: return "lockInline"
    default: return nil
    }
}

struct CustomMetricInfo {
    let label: String
    let symbol: String
}

func customMetricInfo(_ metric: String) -> CustomMetricInfo? {
    switch metric {
    case "calories_remaining":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.calories_remaining"), symbol: "flame.fill")
    case "calories_eaten":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.calories_eaten"), symbol: "fork.knife")
    case "calories_burned":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.calories_burned"), symbol: "bolt.fill")
    case "calorie_goal":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.calorie_goal"), symbol: "target")
    case "protein":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.protein"), symbol: "p.circle.fill")
    case "carbs":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.carbs"), symbol: "c.circle.fill")
    case "fat":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.fat"), symbol: "f.circle.fill")
    case "water":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.water"), symbol: "drop.fill")
    case "weight":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.weight"), symbol: "scalemass.fill")
    case "steps":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.steps"), symbol: "figure.walk")
    case "sleep_duration":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.sleep_duration"), symbol: "bed.double.fill")
    case "resting_heart_rate":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.resting_heart_rate"), symbol: "heart.fill")
    case "heart_rate":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.heart_rate"), symbol: "waveform.path.ecg")
    case "exercise_minutes":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.exercise_minutes"), symbol: "figure.run")
    case "fasting_elapsed":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.fasting_elapsed"), symbol: "timer")
    case "logging_streak":
        return CustomMetricInfo(label: localizedWidgetString("widget.custom.metric.logging_streak"), symbol: "flame")
    default:
        return nil
    }
}

func customAccentColor(_ name: String) -> Color {
    switch name {
    case "green": return .green
    case "orange": return .orange
    case "red": return .red
    case "purple": return .purple
    case "teal": return .teal
    case "pink": return .pink
    case "gray": return .gray
    default: return .blue
    }
}

// MARK: - Formatting

private func customDecimalString(_ value: Double, maxFraction: Int) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.locale = widgetLocale()
    formatter.maximumFractionDigits = maxFraction
    return formatter.string(from: NSNumber(value: value)) ?? "0"
}

struct CustomFormatted {
    let number: String
    let unit: String?

    var full: String {
        guard let unit else { return number }
        return "\(number) \(unit)"
    }
}

/// The figure and its unit. Fasting is a running clock and is drawn by
/// `customValueText` instead.
func customFormat(metric: String, value: CustomMetricValue, energy: WidgetEnergyUnit) -> CustomFormatted {
    if metric == "sleep_duration" {
        let totalMinutes = max(0, Int(value.value.rounded()))
        let hours = localizedNumberString(Double(totalMinutes / 60))
        let minutes = localizedNumberString(Double(totalMinutes % 60))
        let text = String(format: localizedWidgetString("widget.custom.duration_hm"), hours, minutes)
        return CustomFormatted(number: text, unit: nil)
    }
    switch value.unit {
    case "energy":
        return CustomFormatted(
            number: localizedNumberString(energy.fromKcal(value.value)),
            unit: energyUnitLabel(energy)
        )
    case "g":
        return CustomFormatted(number: localizedNumberString(value.value), unit: localizedWidgetString("widget.custom.unit.g"))
    case "ml":
        return CustomFormatted(number: localizedNumberString(value.value), unit: localizedWidgetString("widget.custom.unit.ml"))
    case "oz":
        return CustomFormatted(
            number: customDecimalString(value.value, maxFraction: 1),
            unit: localizedWidgetString("widget.custom.unit.oz")
        )
    case "liter":
        return CustomFormatted(
            number: customDecimalString(value.value, maxFraction: 2),
            unit: localizedWidgetString("widget.custom.unit.l")
        )
    case "kg":
        return CustomFormatted(
            number: customDecimalString(value.value, maxFraction: 1),
            unit: localizedWidgetString("widget.custom.unit.kg")
        )
    case "lb":
        return CustomFormatted(
            number: customDecimalString(value.value, maxFraction: 1),
            unit: localizedWidgetString("widget.custom.unit.lb")
        )
    case "st_lb":
        // Pounds split into stones and pounds. Rounded to a tenth of a pound
        // first so 139.96 lb reads "10st 0lb", never "9st 14lb".
        let tenths = max(0, Int((value.value * 10).rounded()))
        let stones = localizedNumberString(Double(tenths / 140))
        let pounds = customDecimalString(Double(tenths % 140) / 10, maxFraction: 1)
        let text = String(format: localizedWidgetString("widget.custom.weight_st_lb"), stones, pounds)
        return CustomFormatted(number: text, unit: nil)
    case "bpm":
        return CustomFormatted(number: localizedNumberString(value.value), unit: localizedWidgetString("widget.custom.unit.bpm"))
    case "min":
        return CustomFormatted(number: localizedNumberString(value.value), unit: localizedWidgetString("widget.custom.unit.min"))
    default:
        return CustomFormatted(number: localizedNumberString(value.value), unit: nil)
    }
}

// MARK: - Render plan

struct CustomMetricItem: Identifiable {
    let key: String
    let label: String
    let symbol: String
    let value: CustomMetricValue?

    var id: String { key }
}

/// What to draw for one configuration in one placed family. The style falls
/// back to that family's default when it is "auto" or the family cannot show
/// it, and the metrics are cut to what the family fits.
struct CustomRenderPlan {
    let style: String
    let accent: Color
    let standBy: Bool
    let items: [CustomMetricItem]
    let energy: WidgetEnergyUnit
    /// Medium and large widgets can link each number; the others have one tap target.
    let linkable: Bool
    private let links: [String: String]

    init?(config: CustomWidgetConfig, data: CustomWidgetData, family: WidgetFamily) {
        guard let familyKey = customFamilyKey(family) else { return nil }
        let allowed = customFamilyStyles[familyKey] ?? ["value"]
        let limit = customFamilyMaxMetrics[familyKey] ?? 1

        var seen = Set<String>()
        var built: [CustomMetricItem] = []
        for metric in config.metrics {
            guard built.count < limit, !seen.contains(metric), let info = customMetricInfo(metric) else {
                continue
            }
            seen.insert(metric)
            built.append(
                CustomMetricItem(
                    key: metric,
                    label: info.label,
                    symbol: info.symbol,
                    value: data.metrics[metric]
                )
            )
        }
        guard !built.isEmpty else { return nil }

        style = allowed.contains(config.style) ? config.style : allowed[0]
        accent = customAccentColor(config.accent)
        standBy = config.largeText
        items = built
        energy = WidgetEnergyUnit(data.energyUnit)
        linkable = familyKey == "medium" || familyKey == "large"
        links = data.links ?? [:]
    }

    /// Where a tap on this number opens the app, or nil when the app sent no link for it.
    func url(for item: CustomMetricItem) -> URL? {
        guard let path = links[item.key], !path.isEmpty else { return nil }
        return URL(string: "sparkyfitnessmobile://" + path)
    }
}

/// Wraps one number in a link to its screen where the family allows it.
struct CustomItemLink<Content: View>: View {
    let plan: CustomRenderPlan
    let item: CustomMetricItem
    let content: () -> Content

    init(plan: CustomRenderPlan, item: CustomMetricItem, @ViewBuilder content: @escaping () -> Content) {
        self.plan = plan
        self.item = item
        self.content = content
    }

    var body: some View {
        if plan.linkable, let url = plan.url(for: item) {
            Link(destination: url) { content() }
        } else {
            content()
        }
    }
}

/// The figure as a `Text`: a plain number, or for a fast the clock itself,
/// which the system keeps ticking between refreshes.
func customValueText(_ item: CustomMetricItem, energy: WidgetEnergyUnit) -> Text {
    guard let value = item.value else { return Text(verbatim: "–") }
    if value.unit == "since" {
        return Text(Date(timeIntervalSince1970: value.value), style: .timer).monospacedDigit()
    }
    return Text(verbatim: customFormat(metric: item.key, value: value, energy: energy).number)
}

func customUnitLabel(_ item: CustomMetricItem, energy: WidgetEnergyUnit) -> String? {
    guard let value = item.value, value.unit != "since" else { return nil }
    return customFormat(metric: item.key, value: value, energy: energy).unit
}

// MARK: - Intent

// The options in Edit Widget. Raw values are the metric / style / accent ids
// the app and the shared contract use, so a metric added there needs a case
// here (a test checks every id has one).

@available(iOS 17.0, *)
enum CustomMetricOption: String, AppEnum {
    case off
    case calories_remaining
    case calories_eaten
    case calories_burned
    case calorie_goal
    case protein
    case carbs
    case fat
    case water
    case weight
    case steps
    case sleep_duration
    case resting_heart_rate
    case heart_rate
    case exercise_minutes
    case fasting_elapsed
    case logging_streak

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "widget.custom.param.number"
    static var caseDisplayRepresentations: [CustomMetricOption: DisplayRepresentation] = [
        .off: DisplayRepresentation(title: "widget.custom.metric.off"),
        .calories_remaining: DisplayRepresentation(title: "widget.custom.metric.calories_remaining"),
        .calories_eaten: DisplayRepresentation(title: "widget.custom.metric.calories_eaten"),
        .calories_burned: DisplayRepresentation(title: "widget.custom.metric.calories_burned"),
        .calorie_goal: DisplayRepresentation(title: "widget.custom.metric.calorie_goal"),
        .protein: DisplayRepresentation(title: "widget.custom.metric.protein"),
        .carbs: DisplayRepresentation(title: "widget.custom.metric.carbs"),
        .fat: DisplayRepresentation(title: "widget.custom.metric.fat"),
        .water: DisplayRepresentation(title: "widget.custom.metric.water"),
        .weight: DisplayRepresentation(title: "widget.custom.metric.weight"),
        .steps: DisplayRepresentation(title: "widget.custom.metric.steps"),
        .sleep_duration: DisplayRepresentation(title: "widget.custom.metric.sleep_duration"),
        .resting_heart_rate: DisplayRepresentation(title: "widget.custom.metric.resting_heart_rate"),
        .heart_rate: DisplayRepresentation(title: "widget.custom.metric.heart_rate"),
        .exercise_minutes: DisplayRepresentation(title: "widget.custom.metric.exercise_minutes"),
        .fasting_elapsed: DisplayRepresentation(title: "widget.custom.metric.fasting_elapsed"),
        .logging_streak: DisplayRepresentation(title: "widget.custom.metric.logging_streak"),
    ]
}

@available(iOS 17.0, *)
enum CustomStyleOption: String, AppEnum {
    case auto
    case ring
    case bars
    case list
    case grid
    case value

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "widget.custom.param.style"
    static var caseDisplayRepresentations: [CustomStyleOption: DisplayRepresentation] = [
        .auto: DisplayRepresentation(title: "widget.custom.style.auto"),
        .ring: DisplayRepresentation(title: "widget.custom.style.ring"),
        .bars: DisplayRepresentation(title: "widget.custom.style.bars"),
        .list: DisplayRepresentation(title: "widget.custom.style.list"),
        .grid: DisplayRepresentation(title: "widget.custom.style.grid"),
        .value: DisplayRepresentation(title: "widget.custom.style.value"),
    ]
}

@available(iOS 17.0, *)
enum CustomAccentOption: String, AppEnum {
    case blue
    case green
    case orange
    case red
    case purple
    case teal
    case pink
    case gray

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "widget.custom.param.accent"
    static var caseDisplayRepresentations: [CustomAccentOption: DisplayRepresentation] = [
        .blue: DisplayRepresentation(title: "widget.custom.accent.blue"),
        .green: DisplayRepresentation(title: "widget.custom.accent.green"),
        .orange: DisplayRepresentation(title: "widget.custom.accent.orange"),
        .red: DisplayRepresentation(title: "widget.custom.accent.red"),
        .purple: DisplayRepresentation(title: "widget.custom.accent.purple"),
        .teal: DisplayRepresentation(title: "widget.custom.accent.teal"),
        .pink: DisplayRepresentation(title: "widget.custom.accent.pink"),
        .gray: DisplayRepresentation(title: "widget.custom.accent.gray"),
    ]
}

@available(iOS 17.0, *)
struct CustomWidgetIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "widget.custom.name"
    static var description = IntentDescription("widget.custom.description")

    // Four slots fill a medium widget's grid; a small widget shows the first
    // two and a Lock Screen rectangle the first three. "None" leaves one empty.
    @Parameter(title: "widget.custom.param.first", default: .calories_remaining)
    var first: CustomMetricOption

    @Parameter(title: "widget.custom.param.second", default: .protein)
    var second: CustomMetricOption

    @Parameter(title: "widget.custom.param.third", default: .water)
    var third: CustomMetricOption

    @Parameter(title: "widget.custom.param.fourth", default: .steps)
    var fourth: CustomMetricOption

    @Parameter(title: "widget.custom.param.style", default: .auto)
    var style: CustomStyleOption

    @Parameter(title: "widget.custom.param.accent", default: .blue)
    var accent: CustomAccentOption

    @Parameter(title: "widget.custom.param.large_text", default: false)
    var largeText: Bool
}

// MARK: - Provider

@available(iOS 17.0, *)
struct CustomWidgetEntry: TimelineEntry {
    let date: Date
    /// Nil when every slot is "None": the widget then says how to pick numbers.
    let config: CustomWidgetConfig?
    let data: CustomWidgetData
}

enum CustomWidgetSamples {
    static let config = CustomWidgetConfig(metrics: ["protein"], style: "ring", accent: "blue", largeText: false)

    static let data = CustomWidgetData(
        date: nil, lastUpdated: nil, energyUnit: nil,
        metrics: ["protein": CustomMetricValue(value: 92, goal: 160, progress: 0.57, unit: "g")],
        links: nil
    )
}

@available(iOS 17.0, *)
struct CustomWidgetProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CustomWidgetEntry {
        CustomWidgetEntry(date: Date(), config: CustomWidgetSamples.config, data: CustomWidgetSamples.data)
    }

    func snapshot(for configuration: CustomWidgetIntent, in context: Context) async -> CustomWidgetEntry {
        makeEntry(for: configuration)
    }

    func timeline(for configuration: CustomWidgetIntent, in context: Context) async -> Timeline<CustomWidgetEntry> {
        // Only a placed widget gets a timeline, never the gallery preview.
        markCustomWidgetActive()
        return Timeline(entries: [makeEntry(for: configuration)], policy: .after(Date().addingTimeInterval(30 * 60)))
    }

    private func makeEntry(for configuration: CustomWidgetIntent) -> CustomWidgetEntry {
        let picked = [configuration.first, configuration.second, configuration.third, configuration.fourth]
            .map { $0.rawValue }
            .filter { $0 != CustomMetricOption.off.rawValue }
        let config: CustomWidgetConfig? = picked.isEmpty
            ? nil
            : CustomWidgetConfig(
                metrics: picked,
                style: configuration.style.rawValue,
                accent: configuration.accent.rawValue,
                largeText: configuration.largeText
            )
        return CustomWidgetEntry(date: Date(), config: config, data: loadCustomWidgetData())
    }
}

// MARK: - Views

@available(iOS 17.0, *)
struct CustomWidgetView: View {
    let entry: CustomWidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let plan = entry.config.flatMap { CustomRenderPlan(config: $0, data: entry.data, family: family) }
        Group {
            if let plan = plan {
                switch family {
                case .accessoryCircular: CustomLockCircularView(plan: plan)
                case .accessoryRectangular: CustomLockRectangularView(plan: plan)
                case .accessoryInline: CustomLockInlineView(plan: plan)
                default: CustomHomeView(plan: plan)
                }
            } else {
                CustomEmptyView()
            }
        }
        .widgetURL(tapURL(for: plan))
    }

    /// One tap target for a small or Lock Screen widget: its first number's
    /// screen. Medium and large link each number themselves, so a tap on the
    /// background just opens the app.
    private func tapURL(for plan: CustomRenderPlan?) -> URL? {
        let root = URL(string: "sparkyfitnessmobile://")
        guard let plan = plan, !plan.linkable, let first = plan.items.first else { return root }
        return plan.url(for: first) ?? root
    }
}

struct CustomEmptyView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "square.grid.2x2")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text(verbatim: localizedWidgetString("widget.custom.empty"))
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .minimumScaleFactor(0.7)
        }
    }
}

struct CustomHomeView: View {
    let plan: CustomRenderPlan

    var body: some View {
        switch plan.style {
        case "ring": CustomRingStyleView(plan: plan)
        case "bars": CustomBarsStyleView(plan: plan)
        case "list": CustomListStyleView(plan: plan)
        case "grid": CustomGridStyleView(plan: plan)
        default: CustomValueStyleView(plan: plan)
        }
    }
}

/// A figure with its unit beside it, shared by every style.
struct CustomFigureView: View {
    let item: CustomMetricItem
    let energy: WidgetEnergyUnit
    let size: CGFloat

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            customValueText(item, energy: energy)
                .font(.system(size: size, weight: .bold, design: .rounded))
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            if let unit = customUnitLabel(item, energy: energy) {
                Text(verbatim: unit)
                    .font(.system(size: size * 0.5, weight: .medium, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }
}

struct CustomBarView: View {
    let progress: Double
    let color: Color

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(color.opacity(0.2))
                Capsule()
                    .fill(color)
                    .frame(width: max(0, min(1, progress)) * geometry.size.width)
            }
        }
        .frame(height: 6)
        .widgetAccentable()
    }
}

struct CustomValueStyleView: View {
    let plan: CustomRenderPlan

    var body: some View {
        VStack(spacing: plan.standBy ? 4 : 2) {
            if let first = plan.items.first {
                Image(systemName: first.symbol)
                    .font(.title3)
                    .foregroundStyle(plan.accent)
                    .widgetAccentable()
                CustomFigureView(item: first, energy: plan.energy, size: plan.standBy ? 54 : 34)
                Text(verbatim: first.label)
                    .font(plan.standBy ? .body : .caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if let second = plan.items.dropFirst().first, !plan.standBy {
                CustomFigureView(item: second, energy: plan.energy, size: 16)
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct CustomRingStyleView: View {
    let plan: CustomRenderPlan

    var body: some View {
        VStack(spacing: 4) {
            if let first = plan.items.first {
                GeometryReader { geometry in
                    let size = min(geometry.size.width, geometry.size.height)
                    let stroke = size * 0.11
                    ZStack {
                        Circle().stroke(plan.accent.opacity(0.2), lineWidth: stroke)
                        Circle()
                            .trim(from: 0, to: CGFloat(first.value?.progress ?? 0))
                            .stroke(plan.accent, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                        VStack(spacing: 0) {
                            customValueText(first, energy: plan.energy)
                                .font(.system(size: size * 0.24, weight: .bold, design: .rounded))
                                .minimumScaleFactor(0.5)
                                .lineLimit(1)
                            if let unit = customUnitLabel(first, energy: plan.energy) {
                                Text(verbatim: unit)
                                    .font(.system(size: size * 0.12, weight: .medium, design: .rounded))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                        .padding(stroke + 2)
                    }
                    .widgetAccentable()
                    .frame(width: size, height: size)
                    .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
                }
                Text(verbatim: first.label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if let second = plan.items.dropFirst().first {
                HStack(spacing: 4) {
                    Image(systemName: second.symbol)
                        .font(.caption2)
                        .foregroundStyle(plan.accent)
                    CustomFigureView(item: second, energy: plan.energy, size: 13)
                }
            }
        }
    }
}

struct CustomBarsStyleView: View {
    let plan: CustomRenderPlan

    var body: some View {
        // A medium widget with four bars is tight on height: tighten the
        // spacing and the figures so the fourth is not clipped.
        let compact = plan.items.count > 3
        VStack(alignment: .leading, spacing: compact ? 4 : 8) {
            ForEach(plan.items) { item in
                CustomItemLink(plan: plan, item: item) {
                    VStack(alignment: .leading, spacing: compact ? 2 : 3) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(verbatim: item.label)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                            Spacer(minLength: 4)
                            CustomFigureView(item: item, energy: plan.energy, size: compact ? 13 : 15)
                        }
                        if let progress = item.value?.progress {
                            CustomBarView(progress: progress, color: plan.accent)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CustomListStyleView: View {
    let plan: CustomRenderPlan

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(plan.items) { item in
                CustomItemLink(plan: plan, item: item) {
                    HStack(spacing: 8) {
                        Image(systemName: item.symbol)
                            .foregroundStyle(plan.accent)
                            .frame(width: 18)
                            .widgetAccentable()
                        Text(verbatim: item.label)
                            .font(.subheadline)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        CustomFigureView(item: item, energy: plan.energy, size: 17)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CustomGridStyleView: View {
    let plan: CustomRenderPlan

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 10) {
                ForEach(plan.items) { item in
                    CustomItemLink(plan: plan, item: item) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 4) {
                                Image(systemName: item.symbol)
                                    .font(.caption2)
                                    .foregroundStyle(plan.accent)
                                    .widgetAccentable()
                                Text(verbatim: item.label)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                            CustomFigureView(item: item, energy: plan.energy, size: 22)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Lock Screen

struct CustomLockCircularView: View {
    let plan: CustomRenderPlan

    var body: some View {
        if let item = plan.items.first {
            if plan.style == "ring", let progress = item.value?.progress {
                Gauge(value: min(1, max(0, progress))) {
                    Image(systemName: item.symbol)
                } currentValueLabel: {
                    customValueText(item, energy: plan.energy)
                        .minimumScaleFactor(0.5)
                }
                .gaugeStyle(.accessoryCircular)
            } else {
                VStack(spacing: 0) {
                    Image(systemName: item.symbol)
                        .font(.caption)
                    customValueText(item, energy: plan.energy)
                        .font(.system(.headline, design: .rounded))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                }
            }
        }
    }
}

struct CustomLockRectangularView: View {
    let plan: CustomRenderPlan

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(plan.items) { item in
                if plan.style == "bars", let progress = item.value?.progress {
                    Gauge(value: min(1, max(0, progress))) {
                        HStack {
                            Image(systemName: item.symbol)
                            Text(verbatim: item.label).lineLimit(1)
                            Spacer(minLength: 2)
                            customValueText(item, energy: plan.energy)
                        }
                        .font(.caption)
                    }
                    .gaugeStyle(.accessoryLinear)
                } else {
                    HStack {
                        Image(systemName: item.symbol)
                        Text(verbatim: item.label).lineLimit(1)
                        Spacer(minLength: 2)
                        customValueText(item, energy: plan.energy).fontWeight(.semibold)
                    }
                    .font(.caption)
                }
            }
        }
    }
}

struct CustomLockInlineView: View {
    let plan: CustomRenderPlan

    var body: some View {
        if let item = plan.items.first {
            if let value = item.value, value.unit == "since" {
                // A running clock cannot be joined into a string; the clock alone.
                Text(Date(timeIntervalSince1970: value.value), style: .timer)
            } else if let value = item.value {
                Text(verbatim: "\(item.label) \(customFormat(metric: item.key, value: value, energy: plan.energy).full)")
            } else {
                Text(verbatim: "\(item.label) –")
            }
        }
    }
}

// MARK: - Widget

@available(iOS 17.0, *)
struct customWidget: Widget {
    let kind: String = "customWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: CustomWidgetIntent.self, provider: CustomWidgetProvider()) { entry in
            CustomWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("widget.custom.name")
        .description("widget.custom.description")
        .supportedFamilies([
            .systemSmall, .systemMedium, .systemLarge,
            .accessoryCircular, .accessoryRectangular, .accessoryInline,
        ])
    }
}
