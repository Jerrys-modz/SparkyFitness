import SwiftUI

/// Digit pad for one value, laid out like the watch's own passcode pad: big
/// round keys that fill the screen, 1-9 in three rows, then the decimal point,
/// 0 and delete. watchOS has no usable inline number field, the system
/// keyboard is slow for a number, and the Digital Crown alone makes a
/// 60 → 82.5 change a long scroll, so a tapped value opens this instead.
///
/// Opens empty with the current value in grey rather than filled in, so a new
/// number is typed straight away instead of deleting the old one first; OK
/// with nothing typed keeps the grey value. Closes itself after OK.
struct NumericKeypadView: View {
    let title: String
    let initial: Double?
    let allowsDecimal: Bool
    /// Shows a ± key so an assisted bodyweight set can be entered below zero.
    var allowsNegative: Bool = false
    /// What may be committed, when there is a limit. A value outside it
    /// shows in red and leaves OK off instead of closing having done nothing.
    var range: ClosedRange<Double>? = nil
    let onCommit: (Double) -> Void

    @State private var entry: String = ""
    @Environment(\.dismiss) private var dismiss

    /// Enough for 99999 or 1234.56, and short enough to stay legible.
    private static let maxIntegerDigits = 5
    private static let maxFractionDigits = 2
    private static let spacing: CGFloat = 4

    private enum Key: Hashable {
        case digit(Int)
        case decimal
        case delete
        case blank
    }

    private var rows: [[Key]] {
        [
            [.digit(1), .digit(2), .digit(3)],
            [.digit(4), .digit(5), .digit(6)],
            [.digit(7), .digit(8), .digit(9)],
            [allowsDecimal ? .decimal : .blank, .digit(0), .delete],
        ]
    }

    /// What OK would save: the typed number, or the grey one when nothing is
    /// typed. Nil when that isn't a usable number or is outside `range`.
    private var committable: Double? {
        let value = entry.isEmpty ? initial : Double(entry)
        guard let value, value.isFinite else { return nil }
        if let range, !range.contains(value) { return nil }
        return value
    }

    /// Something is typed but it can't be saved, e.g. a weight of 9000.
    private var isInvalid: Bool {
        !entry.isEmpty && entry != "-" && committable == nil
    }

    var body: some View {
        GeometryReader { geo in
            let displayHeight: CGFloat = 30
            let okHeight: CGFloat = 30
            // Four rows of keys share whatever the display and OK leave, so
            // the keys are as big as the screen allows on every watch size.
            let keyHeight = max(
                22,
                (geo.size.height - displayHeight - okHeight - Self.spacing * 5) / 4
            )

            VStack(spacing: Self.spacing) {
                display
                    .frame(height: displayHeight)

                ForEach(rows.indices, id: \.self) { row in
                    HStack(spacing: Self.spacing) {
                        ForEach(rows[row], id: \.self) { key in
                            keyView(key)
                                .frame(maxWidth: .infinity)
                                .frame(height: keyHeight)
                        }
                    }
                }

                okButton
                    .frame(height: okHeight)
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
        }
        .padding(.horizontal, 2)
    }

    // MARK: - Pieces

    /// The number being typed and its unit. Centered, not leading: the sheet's
    /// close button sits in the top-leading corner and covered a left-aligned
    /// number.
    private var display: some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(entry.isEmpty ? placeholder : shown(entry))
                .font(.system(size: 24, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(
                    entry.isEmpty ? Color.secondary : (isInvalid ? Color.red : Color.primary)
                )
                .contentTransition(.numericText())
                .animation(.snappy(duration: 0.15), value: entry)
            Text(title)
                .watchFont(.footnote, classic: .system(size: 10))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            if allowsNegative {
                Button(action: Haptics.tapping(toggleSign)) {
                    Image(systemName: "plusminus")
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                }
                .buttonStyle(KeypadKeyStyle())
                .accessibilityLabel(
                    String(localized: "watch.keypad.toggleSign", defaultValue: "Plus or minus")
                )
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func keyView(_ key: Key) -> some View {
        switch key {
        case .digit(let digit):
            Button(action: Haptics.tapping { press(key) }) {
                Text(String(digit))
                    .font(.system(size: 22, weight: .medium, design: .rounded))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(KeypadKeyStyle())
        case .decimal:
            Button(action: Haptics.tapping { press(key) }) {
                Text(Self.decimalSeparator)
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(KeypadKeyStyle())
            .accessibilityLabel(
                String(localized: "watch.keypad.decimal", defaultValue: "Decimal point")
            )
        case .delete:
            // No key behind it, as on the passcode pad, so it reads as an
            // action rather than another digit.
            Button(action: Haptics.tapping { press(key) }) {
                Image(systemName: "delete.left")
                    .font(.system(size: 18, weight: .medium))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(KeypadKeyStyle(filled: false))
            .disabled(entry.isEmpty)
            .accessibilityLabel(
                String(localized: "watch.keypad.delete", defaultValue: "Delete")
            )
        case .blank:
            Color.clear
        }
    }

    private var okButton: some View {
        Button {
            guard let value = committable else { return }
            Haptics.tap()
            onCommit(value)
            dismiss()
        } label: {
            Text(String(localized: "watch.common.ok", defaultValue: "OK"))
                .watchFont(.body.weight(.semibold), classic: .footnote.weight(.semibold))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .buttonStyle(KeypadKeyStyle(tint: .green))
        .disabled(committable == nil)
    }

    // MARK: - Typing

    private var placeholder: String {
        guard let initial else { return "0" }
        return shown(Self.format(initial))
    }

    /// Up to two decimals with trailing zeros dropped: 82.5, not 82.50.
    private static func format(_ value: Double) -> String {
        if value == value.rounded() { return String(Int(value)) }
        var text = String(format: "%.2f", value)
        while text.hasSuffix("0") { text.removeLast() }
        return text
    }

    /// The point as this wearer writes it. What is typed is kept with a "."
    /// so it always parses; only the screen shows the local separator.
    private static let decimalSeparator = Locale.current.decimalSeparator ?? "."

    private func shown(_ text: String) -> String {
        text.replacingOccurrences(of: ".", with: Self.decimalSeparator)
    }

    /// Flips the typed value between added (+) and assisted (−). With nothing
    /// typed yet a lone "-" waits for the digits.
    private func toggleSign() {
        if entry.hasPrefix("-") {
            entry.removeFirst()
        } else {
            entry = "-" + entry
        }
    }

    private func press(_ key: Key) {
        let sign = entry.hasPrefix("-") ? "-" : ""
        let unsigned = entry.hasPrefix("-") ? String(entry.dropFirst()) : entry
        let parts = unsigned.split(separator: ".", omittingEmptySubsequences: false)
        let hasPoint = parts.count > 1

        switch key {
        case .delete:
            if !entry.isEmpty { entry.removeLast() }
        case .decimal:
            guard !hasPoint else { return }
            entry = sign + (unsigned.isEmpty ? "0." : unsigned + ".")
        case .digit(let digit):
            if hasPoint {
                guard parts[1].count < Self.maxFractionDigits else { return }
                entry += String(digit)
            } else if unsigned == "0" {
                // A leading zero is replaced rather than kept: 07 is just 7.
                entry = sign + String(digit)
            } else {
                guard unsigned.count < Self.maxIntegerDigits else { return }
                entry += String(digit)
            }
        case .blank:
            break
        }
    }
}

/// A passcode-pad key: a dark grey capsule that lights up and shrinks a touch
/// while pressed, so a press is seen as well as felt.
private struct KeypadKeyStyle: ButtonStyle {
    var filled = true
    var tint: Color? = nil

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(tint == nil ? Color.primary : Color.black)
            .background(
                Capsule().fill(background(pressed: configuration.isPressed))
            )
            .contentShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .opacity(isEnabled ? 1 : 0.35)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }

    private func background(pressed: Bool) -> Color {
        if let tint {
            return pressed ? tint.opacity(0.7) : tint
        }
        if !filled {
            return pressed ? Color(white: 0.25) : Color.clear
        }
        return Color(white: pressed ? 0.42 : 0.22)
    }
}
