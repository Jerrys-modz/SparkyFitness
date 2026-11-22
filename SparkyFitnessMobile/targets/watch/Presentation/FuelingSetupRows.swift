import SwiftUI

/// The fuel and drink reminder rows of a cardio start screen's Alerts list,
/// shared by the standard and the classic workout layouts. Each reminder is off
/// until turned on here and only lasts for this run, like the other alerts; the
/// reminders run on the watch's own clock, so they keep coming with the phone
/// left behind.
struct FuelingSetupRows: View {
    @Binding var alerts: WatchRunAlertSetup
    /// Where the amounts start when turned on: what the phone last planned, or
    /// the usual amounts.
    let suggested: WatchFuelingPlan

    /// A plan with both reminders off, carrying the amounts to start from.
    private var blank: WatchFuelingPlan {
        WatchFuelingPlan(
            carbIntervalMin: nil,
            portionGrams: suggested.portionGrams,
            drinkIntervalMin: nil,
            mlPerDrink: suggested.mlPerDrink
        )
    }

    private func setFuel(_ on: Bool) {
        var plan = alerts.fueling ?? blank
        plan.carbIntervalMin = on ? (suggested.carbIntervalMin ?? WatchFuelingPlan.defaultCarbIntervalMin) : nil
        alerts.fueling = plan.isOn ? plan : nil
    }

    private func setDrink(_ on: Bool) {
        var plan = alerts.fueling ?? blank
        plan.drinkIntervalMin = on ? (suggested.drinkIntervalMin ?? WatchFuelingPlan.defaultDrinkIntervalMin) : nil
        alerts.fueling = plan.isOn ? plan : nil
    }

    private var carbIntervalBinding: Binding<Int> {
        Binding(
            get: { alerts.fueling?.carbIntervalMin ?? WatchFuelingPlan.defaultCarbIntervalMin },
            set: { alerts.fueling?.carbIntervalMin = $0 }
        )
    }

    private var portionBinding: Binding<Int> {
        Binding(
            get: { alerts.fueling?.portionGrams ?? WatchFuelingPlan.defaultPortionGrams },
            set: { alerts.fueling?.portionGrams = $0 }
        )
    }

    private var drinkIntervalBinding: Binding<Int> {
        Binding(
            get: { alerts.fueling?.drinkIntervalMin ?? WatchFuelingPlan.defaultDrinkIntervalMin },
            set: { alerts.fueling?.drinkIntervalMin = $0 }
        )
    }

    private var mlBinding: Binding<Int> {
        Binding(
            get: { alerts.fueling?.mlPerDrink ?? WatchFuelingPlan.defaultMlPerDrink },
            set: { alerts.fueling?.mlPerDrink = $0 }
        )
    }

    private func label(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.footnote).foregroundStyle(.secondary)
            Text(value).font(.system(size: WatchStyle.s(16), weight: .semibold)).monospacedDigit()
        }
    }

    var body: some View {
        Toggle(String(localized: "watch.run.fuelReminders", defaultValue: "Fuel reminders"), isOn: Binding(
            get: { alerts.fueling?.carbIntervalMin != nil },
            set: { setFuel($0) }
        ))
        if alerts.fueling?.carbIntervalMin != nil {
            Stepper(
                value: carbIntervalBinding,
                in: WatchFuelingPlan.carbIntervalRange,
                step: WatchFuelingPlan.intervalStep
            ) {
                label(
                    String(localized: "watch.cardio.every", defaultValue: "Every"),
                    "\(carbIntervalBinding.wrappedValue) \(String(localized: "watch.unit.min", defaultValue: "min"))"
                )
            }
            Stepper(
                value: portionBinding,
                in: WatchFuelingPlan.portionRange,
                step: WatchFuelingPlan.portionStep
            ) {
                label(
                    String(localized: "watch.cardio.portion", defaultValue: "Portion"),
                    "\(portionBinding.wrappedValue) \(String(localized: "watch.unit.g", defaultValue: "g"))"
                )
            }
        }
        Toggle(String(localized: "watch.run.drinkReminders", defaultValue: "Drink reminders"), isOn: Binding(
            get: { alerts.fueling?.drinkIntervalMin != nil },
            set: { setDrink($0) }
        ))
        if alerts.fueling?.drinkIntervalMin != nil {
            Stepper(
                value: drinkIntervalBinding,
                in: WatchFuelingPlan.drinkIntervalRange,
                step: WatchFuelingPlan.intervalStep
            ) {
                label(
                    String(localized: "watch.cardio.every", defaultValue: "Every"),
                    "\(drinkIntervalBinding.wrappedValue) \(String(localized: "watch.unit.min", defaultValue: "min"))"
                )
            }
            Stepper(
                value: mlBinding,
                in: WatchFuelingPlan.mlRange,
                step: WatchFuelingPlan.mlStep
            ) {
                label(
                    String(localized: "watch.cardio.amount", defaultValue: "Each drink"),
                    "\(mlBinding.wrappedValue) \(String(localized: "watch.unit.ml", defaultValue: "ml"))"
                )
            }
        }
    }
}
