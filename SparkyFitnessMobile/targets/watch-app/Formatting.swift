import Foundation

let wholeNumberFormatter: NumberFormatter = {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.maximumFractionDigits = 0
    return f
}()

func formatWhole(_ value: Double?) -> String {
    guard let value else { return "-" }
    return wholeNumberFormatter.string(from: NSNumber(value: value.rounded())) ?? "0"
}

/// One decimal place reads better than a whole-number round for fractional
/// plates (e.g. 62.5 kg / 137.5 lb); trims a trailing ".0" so a clean number
/// ("60") doesn't render as "60.0".
func formatTrimmedDecimal(_ value: Double) -> String {
    let rounded = (value * 10).rounded() / 10
    if rounded == rounded.rounded() {
        return "\(Int(rounded))"
    }
    return String(format: "%.1f", rounded)
}

func formatWeight(_ value: Double?, unit: String) -> String {
    guard let value else { return "-" }
    return "\(formatTrimmedDecimal(value)) \(unit)"
}

func relativeStaleness(generatedAt: Double?) -> String? {
    guard let generatedAt, generatedAt > 0 else { return nil }
    let seconds = Date().timeIntervalSince1970 - generatedAt
    guard seconds > 120 else { return nil }
    let minutes = Int(seconds / 60)
    return minutes < 60 ? "Synced \(minutes)m ago" : "Sync stale"
}
