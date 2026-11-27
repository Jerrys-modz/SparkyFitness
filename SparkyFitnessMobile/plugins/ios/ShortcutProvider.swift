import AppIntents

// Lists the Siri and Shortcuts actions in Spotlight, the Shortcuts app and the
// Action button, with the phrases Siri understands. App-target only: an
// AppShortcutsProvider is discovered from the app, while the intents themselves
// (targets/widget/ShortcutIntents.swift) are also compiled into the widget
// extension so Lock Screen and Control Center controls can run them.
@available(iOS 16.0, *)
struct SparkyFitnessShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogWaterIntent(),
            phrases: [
                "Log water in \(.applicationName)",
                "Add water to \(.applicationName)",
            ],
            shortTitle: "Log water",
            systemImageName: "drop.fill"
        )
        AppShortcut(
            intent: StartFastIntent(),
            phrases: ["Start a fast in \(.applicationName)"],
            shortTitle: "Start fast",
            systemImageName: "timer"
        )
        AppShortcut(
            intent: EndFastIntent(),
            phrases: ["End my fast in \(.applicationName)"],
            shortTitle: "End fast",
            systemImageName: "stop.circle"
        )
        AppShortcut(
            intent: LogWeightIntent(),
            phrases: ["Log my weight in \(.applicationName)"],
            shortTitle: "Log weight",
            systemImageName: "scalemass"
        )
        AppShortcut(
            intent: LogMealIntent(),
            phrases: ["Log \(\.$meal) in \(.applicationName)"],
            shortTitle: "Log meal",
            systemImageName: "fork.knife"
        )
        AppShortcut(
            intent: OpenWorkoutPresetIntent(),
            phrases: ["Open \(\.$workout) in \(.applicationName)"],
            shortTitle: "Open workout",
            systemImageName: "figure.strengthtraining.traditional"
        )
        AppShortcut(
            intent: CaloriesLeftIntent(),
            phrases: [
                "How many calories do I have left in \(.applicationName)",
                "Calories left in \(.applicationName)",
            ],
            shortTitle: "Calories left",
            systemImageName: "flame"
        )
        AppShortcut(
            intent: MacrosTodayIntent(),
            phrases: [
                "How much protein have I had in \(.applicationName)",
                "My macros today in \(.applicationName)",
            ],
            shortTitle: "Macros today",
            systemImageName: "chart.pie"

        )
        AppShortcut(
            intent: CheckInWithCoachesIntent(),
            phrases: [
                "Check in with my coaches in \(.applicationName)",
                "Ask my \(.applicationName) coaches",
            ],
            shortTitle: "Check in with coaches",
            systemImageName: "sparkles"
        )
        AppShortcut(
            intent: ReadCoachMessagesIntent(),
            phrases: [
                "Read my coach messages in \(.applicationName)",
                "What do my \(.applicationName) coaches say",
            ],
            shortTitle: "Read coach messages",
            systemImageName: "text.bubble"
        )
        AppShortcut(
            intent: AnswerCoachQuestionIntent(),
            phrases: [
                "Answer my coach in \(.applicationName)",
                "Answer my \(.applicationName) coach",
            ],
            shortTitle: "Answer my coach",
            systemImageName: "checkmark.bubble"
        )
    }
}
