import SwiftUI
import WatchKit

/// System Now Playing as its own swipe page, so a workout can reach play,
/// pause, skip and volume without leaving the app. Whatever is already
/// playing is the source — Apple Music, a podcast, or another app — and
/// this view does not choose it.
///
/// Apple requires `NowPlayingView` to fill a non-scrolling screen and to
/// have no other controls on it. The page swipe is the way back to the set.
struct NowPlayingPage: View {
    var body: some View {
        NowPlayingView()
    }
}
