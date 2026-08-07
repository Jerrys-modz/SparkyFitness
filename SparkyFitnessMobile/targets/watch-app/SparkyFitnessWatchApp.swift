import SwiftUI

@main
struct SparkyFitnessWatchApp: App {
    @StateObject private var session = WatchSessionManager.shared
    @StateObject private var workoutSession = WorkoutSessionManager()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(workoutSession)
                .onAppear {
                    session.activate()
                    // Covers a cold launch that lands on an already-live
                    // workout (context arrived before this view existed) —
                    // `.onChange` below only fires on later transitions.
                    workoutSession.syncToActiveState(session.context.activeWorkout != nil)
                }
                .onChange(of: scenePhase) { _, newPhase in
                    // Watch apps are frequently suspended/relaunched by the
                    // OS; re-request the latest state on every foreground so
                    // a stale in-memory context from a previous launch never
                    // lingers on screen.
                    if newPhase == .active {
                        session.requestSync()
                    }
                }
                .onChange(of: session.context.activeWorkout?.sessionId) { _, newSessionId in
                    // Drives the HealthKit workout session lifecycle from
                    // here (not from a view further down the tree) so it
                    // keeps running heart rate collection no matter which
                    // tab is on screen.
                    workoutSession.syncToActiveState(newSessionId != nil)
                }
        }
    }
}

private struct RootView: View {
    var body: some View {
        TabView {
            TodayView()
                .tag(0)
            WorkoutHomeView()
                .tag(1)
        }
        .tabViewStyle(.page)
    }
}
