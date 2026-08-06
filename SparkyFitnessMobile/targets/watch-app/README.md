# SparkyFitness watchOS companion app

A standalone watchOS app (`@bacons/apple-targets` `type: "watch"`), embedded
into the iOS app by `expo prebuild`. It mirrors the phone's live workout and
today's calorie/macro totals over **WatchConnectivity** — not the widget's
shared App Group, which only shares data within one physical device's
sandbox and never reaches a paired watch.

## What it does

- **Today tab** — calorie ring + food/burned/goal + macros, visually
  consistent with the home-screen widget (`targets/widget/`).
- **Workout tab** — a Hevy-style single-set-at-a-time flow: start a preset,
  log the current set's reps/weight, ride the rest timer, finish the
  workout. The watch never runs its own workout logic; every button press
  becomes a `WatchCommand` sent to the phone, which drives the exact same
  `activeWorkoutStore` actions the phone UI and the workout Live Activity
  already use (see `src/components/WatchWorkoutBridge.tsx`).

## How data flows

```
activeWorkoutStore / DailySummary (phone)
  -> src/services/watchContext.ts        (assembles one WatchAppContext)
  -> src/services/watchConnectivity.ios.ts
  -> modules/sparky-watch-connectivity (native, Swift)
  -> WCSession.updateApplicationContext (phone -> watch, OS-delivered)
  -> WatchSessionManager.swift (this target)
  -> SwiftUI views (TodayView / WorkoutHomeView / ActiveWorkoutView)
```

Button taps go the other way as a `WatchCommand` (`WatchSessionManager.send`
in this target), delivered via `sendMessage` when reachable or queued with
`transferUserInfo` otherwise, and handled by `WatchWorkoutBridge.tsx` on the
phone.

Keep `Models.swift` (this target) and `src/types/watchBridge.ts` in lockstep
— they describe the same JSON on either end of the wire.

## Building this target

This target only builds on macOS with Xcode; it cannot be built or verified
in a Linux/CI-only environment. From `SparkyFitnessMobile/`:

```bash
pnpm install            # links the sparky-watch-connectivity local module
npx expo prebuild --clean
open ios/SparkyFitnessMobile.xcworkspace
```

In Xcode, select the generated watch app scheme (`SparkyFitnessWatch`) and a
paired Watch Simulator (with a paired iPhone Simulator already running the
main app) to run it. First-run checklist:

- Confirm the generated watch target's bundle identifier is nested under the
  main app's (`<main-bundle-id>.watchkitapp`) — required for WatchConnectivity
  pairing and for the OS to treat it as a companion app.
- Confirm the "Embed Watch Content" build phase on the main app target
  references the generated watch app product.
- Set the Apple Team ID / signing for the new watch target the same way the
  main app and the `CalorieTracker` widget target are signed.

## Known limitations (v1)

- The watch can only start a **preset** workout, not an empty/ad-hoc one —
  starting empty requires picking a first exercise via the phone's
  `ExerciseSearch` screen, which has no watch-side equivalent yet.
  `WatchWorkoutBridge.handleStartPreset` is the place to extend this.
- Commands require the phone app process to be alive to react to
  `sendMessage`/`transferUserInfo` (background delivery to a fully
  force-quit phone app is not guaranteed by WatchConnectivity).
- `logSet` always logs the phone's current cursor set — there's no
  per-exercise navigation on the watch because `activeWorkoutStore` itself
  doesn't expose one (see `ActiveWorkoutView.swift`'s doc comment).
