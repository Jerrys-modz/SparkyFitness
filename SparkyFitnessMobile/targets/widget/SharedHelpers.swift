import Foundation

let snapshotDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

func todayDateString() -> String {
    snapshotDateFormatter.string(from: Date())
}

func isToday(_ dateString: String?) -> Bool {
    guard let dateString else { return false }
    return dateString == todayDateString()
}

func appGroupIdentifier() -> String? {
    if let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String {
        return appGroup
    }

    guard let bundleIdentifier = Bundle.main.bundleIdentifier else {
        return nil
    }

    if bundleIdentifier.hasSuffix(".widget") {
        return "group.\(bundleIdentifier.dropLast(".widget".count))"
    }
    return "group.\(bundleIdentifier)"
}

/// Locale used for number formatting and localized-string lookups. iOS owns
/// the per-app language (final PR3), so WidgetKit always resolves from its
/// native locale — there is no persisted widget-only override.
func widgetLocale() -> Locale {
    return .current
}

/// Resolves a widget string key against the localized resources. Never
/// intentionally displays a raw key:
///
///   1. the extension's native/current bundle (iOS per-app language);
///   2. the English widget bundle;
///   3. a stable readable fallback map for the known key set.
func localizedWidgetString(_ key: String) -> String {
    let bundles: [Bundle?] = [
        Bundle.main,
        Bundle.main.path(forResource: "en", ofType: "lproj").flatMap { Bundle(path: $0) },
    ]

    for bundle in bundles {
        guard let bundle else { continue }
        let value = bundle.localizedString(forKey: key, value: nil, table: nil)
        if !value.isEmpty && value != key {
            return value
        }
    }
    return fallbackWidgetString(key)
}

/// The energy unit the phone sends with a calorie or macro snapshot. A
/// snapshot written by an older app has none, and its numbers are kcal.
/// Snapshot numbers are always kcal; views convert them for display.
enum WidgetEnergyUnit {
    case kcal
    case kJ

    init(_ raw: String?) {
        self = raw == "kJ" ? .kJ : .kcal
    }

    /// A value stored in kcal, in this unit.
    func fromKcal(_ kcal: Double) -> Double {
        self == .kJ ? kcal * 4.184 : kcal
    }
}

func energyUnitLabel(_ unit: WidgetEnergyUnit) -> String {
    unit == .kJ ? localizedWidgetString("widget.kj") : localizedWidgetString("widget.kcal")
}

func energyLeftLabel(_ unit: WidgetEnergyUnit) -> String {
    unit == .kJ ? localizedWidgetString("widget.kj_left") : localizedWidgetString("widget.kcal_left")
}

/// Format with one `%@` for the number, for VoiceOver.
func energyA11yFormat(_ unit: WidgetEnergyUnit) -> String {
    unit == .kJ ? localizedWidgetString("widget.a11y.kj") : localizedWidgetString("widget.a11y.kcal")
}

/// Format with one `%@` for the number left, for VoiceOver.
func energyLeftA11yFormat(_ unit: WidgetEnergyUnit) -> String {
    unit == .kJ
        ? localizedWidgetString("widget.a11y.kj_left")
        : localizedWidgetString("widget.a11y.kcal_left")
}

/// Stable readable English fallback for the small known widget key set, used
/// only when every localization bundle is missing the key.
private func fallbackWidgetString(_ key: String) -> String {
    switch key {
    case "widget.calorie.name": return "Calories"
    case "widget.calorie.description": return "Today's calorie intake at a glance."
    case "widget.macro.name": return "Macros"
    case "widget.macro.description": return "Today's protein, carbs, and fat at a glance."
    case "widget.kcal_left": return "kcal left"
    case "widget.kcal": return "kcal"
    case "widget.kj_left": return "kJ left"
    case "widget.kj": return "kJ"
    case "widget.food": return "Food"
    case "widget.burned": return "Burned"
    case "widget.goal": return "Goal"
    case "widget.protein": return "Protein"
    case "widget.carbs": return "Carbs"
    case "widget.fat": return "Fat"
    case "widget.grams": return "%@ g"
    case "widget.a11y.kcal_left": return "%@ kcal left"
    case "widget.a11y.kcal": return "%@ kcal"
    case "widget.a11y.kj_left": return "%@ kJ left"
    case "widget.a11y.kj": return "%@ kJ"
    case "widget.control.log_water.name": return "Log water"
    case "widget.water.name": return "Water"
    case "widget.water.description": return "Today's water intake, with a button to log a drink."
    case "widget.water.title": return "Water"
    case "widget.water.add": return "Log a drink"
    case "widget.water.remove": return "Remove a drink"
    case "widget.search_food": return "Search food"
    case "widget.scan_barcode": return "Scan barcode"
    case "widget.custom.name": return "Custom widget"
    case "widget.custom.description": return "A widget you design in SparkyFitness."
    case "widget.custom.empty": return "Open SparkyFitness to build a widget"
    case "widget.custom.metric.calories_remaining": return "Calories left"
    case "widget.custom.metric.calories_eaten": return "Eaten"
    case "widget.custom.metric.calories_burned": return "Burned"
    case "widget.custom.metric.calorie_goal": return "Calorie goal"
    case "widget.custom.metric.protein": return "Protein"
    case "widget.custom.metric.carbs": return "Carbs"
    case "widget.custom.metric.fat": return "Fat"
    case "widget.custom.metric.water": return "Water"
    case "widget.custom.metric.weight": return "Weight"
    case "widget.custom.metric.steps": return "Steps"
    case "widget.custom.metric.sleep_duration": return "Sleep"
    case "widget.custom.metric.resting_heart_rate": return "Resting HR"
    case "widget.custom.metric.heart_rate": return "Avg heart rate"
    case "widget.custom.metric.exercise_minutes": return "Exercise"
    case "widget.custom.metric.fasting_elapsed": return "Fasting"
    case "widget.custom.metric.logging_streak": return "Streak"
    case "widget.custom.unit.g": return "g"
    case "widget.custom.unit.kg": return "kg"
    case "widget.custom.unit.lb": return "lb"
    case "widget.custom.weight_st_lb": return "%@st %@lb"
    case "widget.custom.unit.ml": return "ml"
    case "widget.custom.unit.l": return "L"
    case "widget.custom.unit.bpm": return "bpm"
    case "widget.custom.unit.min": return "min"
    case "widget.custom.duration_hm": return "%@h %@m"
    case "widget.custom.family.small": return "Small"
    case "widget.custom.family.medium": return "Medium"
    case "widget.custom.family.large": return "Large"
    case "widget.custom.family.lock_circular": return "Lock Screen circular"
    case "widget.custom.family.lock_rectangular": return "Lock Screen rectangular"
    case "widget.custom.family.lock_inline": return "Lock Screen inline"
    default: return key
    }
}

/// Locale-aware integer formatter that keeps existing business rounding and
/// never hardcodes an English locale or manual separators.
private func widgetNumberFormatter() -> NumberFormatter {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.locale = widgetLocale()
    formatter.maximumFractionDigits = 0
    return formatter
}

/// Formats a calorie/macro value using the widget locale, preserving the
/// existing `rounded()` business rounding.
func localizedNumberString(_ value: Double) -> String {
    widgetNumberFormatter().string(from: NSNumber(value: value.rounded())) ?? "0"
}
