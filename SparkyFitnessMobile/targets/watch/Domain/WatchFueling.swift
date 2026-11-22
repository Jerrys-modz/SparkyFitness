import Foundation

/// The fuel and drink reminders of one wrist-only run. Chosen on the start
/// screen (or taken from what the phone last used) and changeable while it
/// runs. Everything is worked out on the watch from the run's clock, so the
/// reminders keep coming with the phone left at home.
///
/// Mirrors the phone's fueling plan (`shared/src/utils/fuelingPlan.ts` and
/// `drinkPlan.ts`): the first carbohydrate reminder comes after one interval,
/// or after 45 minutes if the interval is longer, then every interval; drink
/// reminders come every interval from the start. Keep the two in step.
struct WatchFuelingPlan: Codable, Equatable {
    /// Minutes between carbohydrate reminders; nil turns them off.
    var carbIntervalMin: Int?
    /// Grams of carbohydrate in one portion.
    var portionGrams: Int
    /// Minutes between drink reminders; nil turns them off.
    var drinkIntervalMin: Int?
    /// Millilitres in one drink.
    var mlPerDrink: Int

    static let carbIntervalRange = 10...60
    static let portionRange = 5...100
    static let drinkIntervalRange = 5...60
    static let mlRange = 50...500
    static let intervalStep = 5
    static let portionStep = 5
    static let mlStep = 25

    static let defaultCarbIntervalMin = 25
    static let defaultPortionGrams = 25
    static let defaultDrinkIntervalMin = 20
    static let defaultMlPerDrink = 150

    /// The first carbohydrate reminder never waits longer than this.
    static let firstCarbMaxMinutes = 45

    /// Whether anything is switched on.
    var isOn: Bool { carbIntervalMin != nil || drinkIntervalMin != nil }

    /// Carbohydrate reminders on, drink reminders off, at the usual amounts.
    static let carbsOnly = WatchFuelingPlan(
        carbIntervalMin: defaultCarbIntervalMin,
        portionGrams: defaultPortionGrams,
        drinkIntervalMin: nil,
        mlPerDrink: defaultMlPerDrink
    )

    static func clamp(_ value: Int, _ range: ClosedRange<Int>) -> Int {
        min(range.upperBound, max(range.lowerBound, value))
    }

    /// The same plan with every number brought inside what the steppers allow,
    /// for values that arrive from the phone.
    var clamped: WatchFuelingPlan {
        WatchFuelingPlan(
            carbIntervalMin: carbIntervalMin.map { Self.clamp($0, Self.carbIntervalRange) },
            portionGrams: Self.clamp(portionGrams, Self.portionRange),
            drinkIntervalMin: drinkIntervalMin.map { Self.clamp($0, Self.drinkIntervalRange) },
            mlPerDrink: Self.clamp(mlPerDrink, Self.mlRange)
        )
    }
}

/// How many of each reminder have already been given, so one is never repeated.
/// Not saved with the run: after a relaunch it is rebuilt from the clock
/// (`resumed`), which counts everything already passed as given.
struct WatchFuelingState: Equatable {
    var carbs = 0
    var drinks = 0

    static func resumed(at elapsed: TimeInterval, plan: WatchFuelingPlan?) -> WatchFuelingState {
        guard let plan else { return WatchFuelingState() }
        return WatchFuelingState(
            carbs: WatchFueling.carbReminders(by: elapsed, plan: plan),
            drinks: WatchFueling.drinkReminders(by: elapsed, plan: plan)
        )
    }
}

enum WatchFuelingCue: Equatable {
    case carbs(grams: Int)
    case drink(ml: Int)
}

enum WatchFueling {
    /// Seconds into the run of the carbohydrate reminder with this 0-based index.
    static func carbTime(_ index: Int, intervalMin: Int) -> TimeInterval {
        let first = min(intervalMin, WatchFuelingPlan.firstCarbMaxMinutes)
        return Double(first + index * intervalMin) * 60
    }

    /// Seconds into the run of the drink reminder with this 0-based index.
    static func drinkTime(_ index: Int, intervalMin: Int) -> TimeInterval {
        Double((index + 1) * intervalMin) * 60
    }

    /// How many carbohydrate reminders are due by `elapsed`.
    static func carbReminders(by elapsed: TimeInterval, plan: WatchFuelingPlan) -> Int {
        guard let interval = plan.carbIntervalMin, interval > 0 else { return 0 }
        let first = carbTime(0, intervalMin: interval)
        guard elapsed >= first else { return 0 }
        return 1 + Int((elapsed - first) / (Double(interval) * 60))
    }

    /// How many drink reminders are due by `elapsed`.
    static func drinkReminders(by elapsed: TimeInterval, plan: WatchFuelingPlan) -> Int {
        guard let interval = plan.drinkIntervalMin, interval > 0 else { return 0 }
        return Int(elapsed / (Double(interval) * 60))
    }

    /// The reminders due at `elapsed` and the state after them. Several passed
    /// at once (the app was suspended) give one cue, not a burst.
    static func next(
        elapsed: TimeInterval,
        plan: WatchFuelingPlan?,
        state: WatchFuelingState
    ) -> (cues: [WatchFuelingCue], state: WatchFuelingState) {
        var state = state
        var cues: [WatchFuelingCue] = []
        guard let plan else { return (cues, state) }

        let carbs = carbReminders(by: elapsed, plan: plan)
        if carbs > state.carbs {
            cues.append(.carbs(grams: plan.portionGrams))
            state.carbs = carbs
        }
        let drinks = drinkReminders(by: elapsed, plan: plan)
        if drinks > state.drinks {
            cues.append(.drink(ml: plan.mlPerDrink))
            state.drinks = drinks
        }
        return (cues, state)
    }

    /// The reminder that comes soonest, for the strip under the clock.
    struct Upcoming: Equatable {
        enum Kind: Equatable { case carbs, drink }
        let kind: Kind
        let secondsLeft: TimeInterval
        /// Grams for a carbohydrate reminder, millilitres for a drink.
        let amount: Int
    }

    static func upcoming(
        elapsed: TimeInterval,
        plan: WatchFuelingPlan?,
        state: WatchFuelingState
    ) -> Upcoming? {
        guard let plan else { return nil }
        var best: Upcoming?
        if let interval = plan.carbIntervalMin, interval > 0 {
            let left = max(0, carbTime(state.carbs, intervalMin: interval) - elapsed)
            best = Upcoming(kind: .carbs, secondsLeft: left, amount: plan.portionGrams)
        }
        if let interval = plan.drinkIntervalMin, interval > 0 {
            let left = max(0, drinkTime(state.drinks, intervalMin: interval) - elapsed)
            if let current = best {
                if left < current.secondsLeft {
                    best = Upcoming(kind: .drink, secondsLeft: left, amount: plan.mlPerDrink)
                }
            } else {
                best = Upcoming(kind: .drink, secondsLeft: left, amount: plan.mlPerDrink)
            }
        }
        return best
    }
}
