import SwiftUI

@main
struct SparkyFitnessWatchApp: App {
    @StateObject private var session = WatchSessionManager.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .onAppear {
                    session.activate()
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
