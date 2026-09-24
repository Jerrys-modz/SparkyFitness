# SparkyFitness Watch

Native watchOS companion app target for SparkyFitnessMobile, added via
`@bacons/apple-targets` (already registered as a plugin in `app.json`, so no
change was needed there — it scans every `targets/*/expo-target.config.js`
directory, including this new one, alongside the existing `targets/widget`).

> **Note:** everything below the Layout section still describes the original
> Phase 1 skeleton (a reachability dot and a "Ping phone" button, neither of
> which exists any more). The build/signing and `generated.entitlements`
> sections are still accurate and still worth reading; the feature
> description is not.

## Layout

Grouped in Clean Architecture rings, outermost depending inward and never the
reverse. Swift has no per-folder namespacing — every file here is one module —
so these folders carry no compiler meaning. The dependency rule is a
convention, and the `import` list of each folder is how you check it:

| Folder            | Ring                      | May import                       |
| ----------------- | ------------------------- | -------------------------------- |
| `Domain/`         | Entities                  | `Foundation` only                |
| `Application/`    | Use cases                 | `Foundation`, `Combine`          |
| `Adapters/`       | Interface adapters        | `Foundation` only                |
| `Infrastructure/` | Frameworks & drivers      | `WatchConnectivity`, `WidgetKit` |
| `Presentation/`   | Frameworks & drivers (UI) | `SwiftUI`, `Charts`, `WatchKit`  |

- **`Domain/`** — the values and rules: check-ins, snapshots, containers,
  units, calendar-day handling, water formatting. Knows nothing about
  WatchConnectivity, storage or SwiftUI.
- **`Application/`** — `CheckInStore`: capture, ack reconciliation, applying a
  context, and the day-rollover rule. _Caveat:_ it is also the
  `ObservableObject` the views observe, which strictly makes it half use-case
  and half view model. Splitting it is the next refactor, not a done one.
- **`Adapters/`** — translation only, and the sole owner of wire-key
  knowledge: `ContextPayloadMapper` (phone dictionary → domain) and
  `OutboundPayloads` (domain → phone dictionary). Both are pure functions over
  `[String: Any]`, which makes them the one part of the sync path that could
  be unit-tested without a paired device.
- **`Infrastructure/`** — `WatchSessionManager` (WCSession lifecycle, sends,
  routing) and `ComplicationPublisher` (App Group storage + `WidgetCenter`).
- **`Presentation/`** — the SwiftUI app entry point and every view.

Four files stay at the target root because the generated Xcode project
references them by exact path: `expo-target.config.js` and `Info.plist` are
named in the target's `membershipExceptions`, `generated.entitlements` is
referenced from build settings, and `Assets.xcassets` is the asset catalog.
Moving any of them into a subfolder breaks the build.

**Scope of this phase:** prove the watch app and phone app can talk to each
other. Nothing else. No real logging feature lives here yet — that's Phase 2
(weight/body fat) and Phase 3 (water), each starting with its own design
session per the project plan.

## What this adds

- `targets/watch/` — the watchOS app itself (SwiftUI, native — watchOS
  doesn't run React Native). `WatchSessionManager.swift` wraps
  `WCSession`; `ContentView.swift` shows a reachability dot, a "Ping phone"
  button, and the last message received from the phone.
- `modules/watch-connectivity/` — a small local Expo Module (new
  architecture / TurboModule-compatible) that wraps `WCSession` on the
  **phone** side and exposes `isReachable()` / `sendPing()` /
  `onMessage` / `onReachabilityChange` to JS. iOS-only; resolves to `null`
  on Android.
- `src/hooks/useWatchConnectivity.ts` — the RN hook wrapping that module.
- `src/components/DevTools.tsx` — a new "Watch Connectivity" section (dev
  builds only) with a reachability indicator, last-received message, and a
  "Ping Watch" button, so you can verify both directions from
  Settings → Dev Tools without adding permanent UI yet.

## Build & run

1. `pnpm install` (pulls in nothing new — no new JS dependencies were
   added, only local module/target files).
2. `npx expo prebuild -p ios --clean` from `SparkyFitnessMobile/`. This
   regenerates `ios/` and should add a new watchOS app scheme
   (`SparkyFitness Watch` or similar) alongside the existing widget target.
3. Open the generated `.xcworkspace` in Xcode.
4. **Signing:** with a free personal team (no paid Developer Program),
   select your personal team manually for _both_ the main app target and
   the new watch app target under Signing & Capabilities — automatic
   signing sometimes only picks up the main target. Builds are valid for
   7 days before needing a reinstall from Xcode, same as your existing
   dev builds.
5. Select the watch app's scheme, target your paired physical Apple
   Watch (not the simulator — WatchConnectivity reachability between the
   iOS Simulator and watchOS Simulator is unreliable/mostly unsupported),
   and run. Then run the main `SparkyFitnessMobile` scheme to your iPhone
   the normal way.
6. In the phone app: Settings → scroll to Dev Tools (dev builds only) →
   "Watch Connectivity" section. Tap "Ping Watch" and confirm the watch
   app's screen updates with the phone's ping; tap "Ping phone" on the
   Watch and confirm the phone's dev tools panel shows it back.

## Known risks to watch for

- **Prebuild wiring bug:** `@bacons/apple-targets` (currently pinned
  `^4.0.6`) has an open upstream issue (#175) where `expo prebuild`
  sometimes generates incorrect "Embed Watch Content" build phases or
  target dependencies for watch targets. If the watch target doesn't
  appear, doesn't embed into the main app, or the build fails on a
  missing/duplicate embed phase, that's the likely cause — check the
  main app target's Build Phases for an "Embed Watch Content" phase
  listing the watch app, and compare against the issue thread for the
  current workaround (a `patch-package` patch to `@bacons/apple-targets`
  is what other users are using as of this writing).
- **Icon:** the watch target currently reuses the phone's adaptive icon,
  which is not sized correctly for a Watch app icon. Fine for this
  skeleton; needs a dedicated Watch icon set before this goes further.
- **`deploymentTarget: '10.0'`** in `expo-target.config.js` is a
  reasonable default — lower it if your physical Watch runs an older
  watchOS.
- This was written and reviewed without access to Xcode or a watchOS
  build/simulator (this session runs in the cloud) — expect to be the
  one hitting and reporting back any build-time surprises for the first
  pass.

## Gotcha: `generated.entitlements` and `val.hasOwnProperty is not a function`

If `expo prebuild` / `expo config` dies with:

```
TypeError: val.hasOwnProperty is not a function
    at serializeAndEvaluate (@expo/config/src/Serialize.ts:14)
    at serializeAfterStaticPlugins (...)
```

the cause is a stale `targets/<name>/generated.entitlements` file, not your
app config. `@bacons/apple-targets` writes that file and, when the target's
`expo-target.config.js` no longer declares `entitlements`, it parses the
leftover file and injects the result at
`eas.build.experimental.ios.appExtensions[n].entitlements`. The plist parser
returns **null-prototype** objects, and Expo's config serializer calls
`val.hasOwnProperty(...)` on every object — which doesn't exist on a
null-prototype object, so it throws.

Fix: blank the stale file (an empty `<dict/>` is safe — the serializer only
trips when the object has at least one key), or delete it and let prebuild
regenerate it:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict/>
</plist>
```

`targets/watch/generated.entitlements` is now in `.gitignore` (matching the
existing entry for `targets/widget/generated.entitlements`) so it can't be
committed in a stale state.

## Local dev identifiers

The upstream dev identifiers (`org.SparkyApps.SparkyFitnessMobile1.dev` and
its app group) are registered to the upstream maintainer's Apple team, so a
different team cannot claim them — Xcode reports "An Application Group with
Identifier ... is not available. Please enter a different string."

`app.identifiers.js` reads overrides from the environment, so put your own
unique identifiers in `SparkyFitnessMobile/.env` (gitignored). Every target
— main app, widget, ExpoWidgetsTarget and this watch app — derives its
bundle ID from `EXPO_DEV_BUNDLE_IDENTIFIER`, so overriding these three is
enough:

```
EXPO_DEV_BUNDLE_IDENTIFIER=com.example.sparkyfitness.dev
IOS_APP_GROUP_DEV=group.com.example.sparkyfitness.dev
EXPO_DEV_APPLE_TEAM_ID=YOURTEAMID
```

Setting `EXPO_DEV_APPLE_TEAM_ID` also means signing survives
`expo prebuild --clean` instead of needing the team re-picked by hand on
each of the four targets.
