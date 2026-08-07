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
- **Live heart rate** — for the duration of a Sparky workout, the watch runs
  its own `HKWorkoutSession` (`WorkoutSessionManager.swift`), the same
  mechanism every watchOS workout app uses. This is deliberately *not* piped
  through WatchConnectivity: the finished `HKWorkout` (with heart rate
  statistics) saves to Apple Health directly, and the phone's existing
  inbound HealthKit sync (`src/services/healthkit/`) reads it back out and
  attaches `avg_heart_rate`/`max_heart_rate` to the resulting exercise entry
  — see "Heart rate data flow" below.

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

## Heart rate data flow

Separate from the WatchConnectivity bridge above — this path goes through
Apple Health, not the phone-watch bridge:

```
activeWorkout mirrored non-nil (this target's WatchSessionManager.context)
  -> SparkyFitnessWatchApp's .onAppear / .onChange
  -> WorkoutSessionManager.syncToActiveState(true)
  -> HKWorkoutSession + HKLiveWorkoutBuilder (this target)
  -> live heart rate published for ActiveWorkoutView's heart rate badge
  -> ...workout ends... -> builder.finishWorkout() saves an HKWorkout to Apple Health
  -> phone's services/healthkit/index.ts handleWorkout() (existing inbound sync)
  -> getStatistic('HKQuantityTypeIdentifierHeartRate', 'count/min')
  -> services/healthkit/dataTransformation.ts (avgHeartRate/maxHeartRate on TransformedExerciseSession)
  -> POST /api/health-data -> SparkyFitnessServer workoutHandler -> exercise_entries.avg_heart_rate/max_heart_rate
```

Requires the `NSHealthShareUsageDescription`/`NSHealthUpdateUsageDescription`
keys in this target's `Info.plist` and the `com.apple.developer.healthkit`
entitlement in `expo-target.config.js` — both already set up. The user grants
HealthKit access on the watch the first time a workout starts there (a
separate authorization from the phone app's own HealthKit permission).

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
- Every workout session is tagged `HKWorkoutActivityType.traditionalStrengthTraining`
  regardless of what's actually being done — Sparky doesn't yet mirror
  per-exercise modality (weights vs. cardio) to the watch. See the comment in
  `WorkoutSessionManager.beginSession()`.
- The Watch Simulator has no real heart rate sensor. Use Xcode's Health app
  debug menu (Features → Health → auto-generate/simulate heart rate data)
  during a Simulator run, or a physical Apple Watch, to see live BPM.
