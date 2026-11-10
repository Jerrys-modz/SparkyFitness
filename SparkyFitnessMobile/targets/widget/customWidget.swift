import AppIntents
import SwiftUI
import WidgetKit

// The widget the in-app builder makes. One generic widget draws whichever
// saved layout the person picks in Edit Widget. The layout list is written by
// `useCustomWidgetLayoutSync` (app root) and the numbers by `useWidgetSync`
// (Dashboard), both as JSON strings in the app group (`customWidgetLayouts`,
// `customWidgetData`); their shape is the
// `WidgetLayout` / `WidgetDataSnapshot` contract in shared/src/utils/widgetLayout.ts.
//
// Everything here reads leniently: an unknown metric, style or family from a
// newer app is skipped, never a crash, because the widget extension and the
// app update independently.

// MARK: - Models

struct CustomWidgetMetricRef: Decodable {
    let metric: String
    let label: String?
}

struct CustomWidgetLayout: Decodable, Identifiable {
    let id: String
    let name: String
    let family: String
    let style: String
    let metrics: [CustomWidgetMetricRef]
    let accent: String
    let showTitle: Bool
    let standByFriendly: Bool

    private enum CodingKeys: String, CodingKey {
        case id, name, family, style, metrics, accent, showTitle, standByFriendly
    }

    init(
        id: String, name: String, family: String, style: String,
        metrics: [CustomWidgetMetricRef], accent: String, showTitle: Bool, standByFriendly: Bool
    ) {
        self.id = id
        self.name = name
        self.family = family
        self.style = style
        self.metrics = metrics
        self.accent = accent
        self.showTitle = showTitle
        self.standByFriendly = standByFriendly
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        family = try container.decodeIfPresent(String.self, forKey: .family) ?? "small"
        style = try container.decodeIfPresent(String.self, forKey: .style) ?? "value"
        metrics = try container.decodeIfPresent([CustomWidgetMetricRef].self, forKey: .metrics) ?? []
        accent = try container.decodeIfPresent(String.self, forKey: .accent) ?? "blue"
        showTitle = try container.decodeIfPresent(Bool.self, forKey: .showTitle) ?? true
        standByFriendly = try container.decodeIfPresent(Bool.self, forKey: .standByFriendly) ?? false
    }
}

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

/// Decodes one array element without failing the whole array when it is bad.
private struct LossyDecodable<T: Decodable>: Decodable {
    let value: T?

    init(from decoder: Decoder) throws {
        value = try? T(from: decoder)
    }
}

// MARK: - Loading

/// The storage writes a string for the JSON these keys hold; a build that
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

func loadCustomWidgetLayouts() -> [CustomWidgetLayout] {
    guard
        let data = readCustomJSON("customWidgetLayouts"),
        let decoded = try? JSONDecoder().decode([LossyDecodable<CustomWidgetLayout>].self, from: data)
    else {
        return []
    }
    return decoded.compactMap { $0.value }
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

func customFamilyDisplayName(_ family: String) -> String {
    switch family {
    case "medium": return localizedWidgetString("widget.custom.family.medium")
    case "large": return localizedWidgetString("widget.custom.family.large")
    case "lockCircular": return localizedWidgetString("widget.custom.family.lock_circular")
    case "lockRectangular": return localizedWidgetString("widget.custom.family.lock_rectangular")
    case "lockInline": return localizedWidgetString("widget.custom.family.lock_inline")
    default: return localizedWidgetString("widget.custom.family.small")
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

/// What to draw for one layout in one placed family. A layout built for a
/// small widget can sit in a medium slot: the style falls back to that
/// family's default and the metrics are cut to what it fits, as the app's
/// editor does with `normalizeWidgetLayout`.
struct CustomRenderPlan {
    let style: String
    let accent: Color
    let title: String?
    let standBy: Bool
    let items: [CustomMetricItem]
    let energy: WidgetEnergyUnit
    /// Medium and large widgets can link each number; the others have one tap target.
    let linkable: Bool
    private let links: [String: String]

    init?(layout: CustomWidgetLayout, data: CustomWidgetData, family: WidgetFamily) {
        guard let familyKey = customFamilyKey(family) else { return nil }
        let allowed = customFamilyStyles[familyKey] ?? ["value"]
        let limit = customFamilyMaxMetrics[familyKey] ?? 1

        var seen = Set<String>()
        var built: [CustomMetricItem] = []
        for ref in layout.metrics {
            guard built.count < limit, !seen.contains(ref.metric), let info = customMetricInfo(ref.metric) else {
                continue
            }
            seen.insert(ref.metric)
            let override = ref.label ?? ""
            built.append(
                CustomMetricItem(
                    key: ref.metric,
                    label: override.isEmpty ? info.label : override,
                    symbol: info.symbol,
                    value: data.metrics[ref.metric]
                )
            )
        }
        guard !built.isEmpty else { return nil }

        style = allowed.contains(layout.style) ? layout.style : allowed[0]
        accent = customAccentColor(layout.accent)
        standBy = layout.standByFriendly
        title = layout.showTitle && !layout.standByFriendly ? layout.name : nil
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

// MARK: - Entity and intent

@available(iOS 17.0, *)
struct CustomWidgetLayoutEntity: AppEntity, Identifiable {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Widget"
    static var defaultQuery = CustomWidgetLayoutQuery()

    let id: String
    let name: String
    let family: String

    init(layout: CustomWidgetLayout) {
        id = layout.id
        name = layout.name
        family = layout.family
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(customFamilyDisplayName(family))")
    }
}

@available(iOS 17.0, *)
struct CustomWidgetLayoutQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [CustomWidgetLayoutEntity] {
        loadCustomWidgetLayouts()
            .filter { identifiers.contains($0.id) }
            .map { CustomWidgetLayoutEntity(layout: $0) }
    }

    func suggestedEntities() async throws -> [CustomWidgetLayoutEntity] {
        loadCustomWidgetLayouts().map { CustomWidgetLayoutEntity(layout: $0) }
    }
}

@available(iOS 17.0, *)
struct SelectCustomWidgetIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Choose widget"
    static var description = IntentDescription("Pick which of your saved widgets to show.")

    @Parameter(title: "Widget")
    var layout: CustomWidgetLayoutEntity?
}

// MARK: - Provider

@available(iOS 17.0, *)
struct CustomWidgetEntry: TimelineEntry {
    let date: Date
    let layout: CustomWidgetLayout?
    let data: CustomWidgetData
}

enum CustomWidgetSamples {
    static let layout = CustomWidgetLayout(
        id: "sample", name: "Today", family: "small", style: "ring",
        metrics: [CustomWidgetMetricRef(metric: "protein", label: nil)],
        accent: "blue", showTitle: true, standByFriendly: false
    )

    static let data = CustomWidgetData(
        date: nil, lastUpdated: nil, energyUnit: nil,
        metrics: ["protein": CustomMetricValue(value: 92, goal: 160, progress: 0.57, unit: "g")],
        links: nil
    )
}

@available(iOS 17.0, *)
struct CustomWidgetProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CustomWidgetEntry {
        CustomWidgetEntry(date: Date(), layout: CustomWidgetSamples.layout, data: CustomWidgetSamples.data)
    }

    func snapshot(for configuration: SelectCustomWidgetIntent, in context: Context) async -> CustomWidgetEntry {
        makeEntry(for: configuration)
    }

    func timeline(for configuration: SelectCustomWidgetIntent, in context: Context) async -> Timeline<CustomWidgetEntry> {
        Timeline(entries: [makeEntry(for: configuration)], policy: .after(Date().addingTimeInterval(30 * 60)))
    }

    /// The picked layout, else the first saved one, so a widget placed before
    /// the person has chosen shows something instead of an empty slot.
    private func makeEntry(for configuration: SelectCustomWidgetIntent) -> CustomWidgetEntry {
        let layouts = loadCustomWidgetLayouts()
        let chosen = layouts.first { $0.id == configuration.layout?.id } ?? layouts.first
        return CustomWidgetEntry(date: Date(), layout: chosen, data: loadCustomWidgetData())
    }
}

// MARK: - Views

@available(iOS 17.0, *)
struct CustomWidgetView: View {
    let entry: CustomWidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let plan = entry.layout.flatMap { CustomRenderPlan(layout: $0, data: entry.data, family: family) }
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

struct CustomTitleView: View {
    let plan: CustomRenderPlan

    var body: some View {
        if let title = plan.title {
            Text(verbatim: title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(plan.accent)
                .lineLimit(1)
                .widgetAccentable()
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
            CustomTitleView(plan: plan)
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
            CustomTitleView(plan: plan)
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
            CustomTitleView(plan: plan)
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
            CustomTitleView(plan: plan)
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
            CustomTitleView(plan: plan)
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
        AppIntentConfiguration(kind: kind, intent: SelectCustomWidgetIntent.self, provider: CustomWidgetProvider()) { entry in
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
