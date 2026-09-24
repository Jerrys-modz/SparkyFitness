# Feature log — Morning Check-In on Apple Watch (weight + body fat %)

**Status:** implemented, pending on-device verification
**Phase:** 2 of the Watch Companion plan
**Designed & built:** 2026-08-17
**Platform:** watchOS (native SwiftUI) + iOS phone app bridge

---

## Why this exists

Adam weighs himself every morning in the bathroom, immediately after getting up,
using a **dumb bathroom scale** — no Bluetooth, no HealthKit. The numbers exist
only on the scale's LCD. His phone is usually in another room.

Before this feature, getting those two numbers into SparkyFitness meant walking
to the phone, unlocking it, opening the app, navigating to Measurements, and
typing into a form. In practice that means days get skipped, and skipped days are
the thing that ruins a long-term body-composition trend.

The feature's whole job: **capture weight and body fat % from the wrist, in a few
seconds, half asleep, without the phone.**

Non-goals (deliberately out of scope): backfilling past days, changing units,
editing other measurements (neck/waist/hips/height), and reading weight
automatically from a smart scale. The phone app remains the place for all of
that.

---

## The design, and why each choice was made

Three independent design explorations were run (speed-first, confidence-first,
ambient/automation-first). They converged on the same core, which is the
strongest signal in this document:

### The Digital Crown does all precision work

Not the keyboard, not +/- buttons. Reasons:

- It needs **no aiming** — usable while barely awake and not looking directly at
  the watch.
- It is **unaffected by water** (mechanical), which matters in a bathroom.
- Haptic detents mean **the tick is the readout**: the value can be dialled
  peripherally.

Settings: `by: 0.1` (one detent = 0.1 kg or 0.1 %), `sensitivity: .medium`,
`isHapticFeedbackEnabled: true`.

### Seeded/anchored to the last known value

The crown starts at the most recent recorded weight, so a normal 0.3 kg overnight
change is **three clicks**. This also produces a powerful side effect:

> Mis-entry becomes structurally hard rather than warned against. Fat-fingering
> `48.6` instead of `84.6` is impossible when the input is a dial — reaching 48.6
> would take ~360 deliberate detents.

The dial is clamped to a window around the seed (**±6 kg** weight, **±5 %** body
fat), which caps it at roughly 2.5 turns and makes overshoot self-correcting.

### Graduated read-back instead of a mandatory confirmation screen

A mandatory review screen would cost one extra tap 365 times a year to catch an
error the anchoring already makes nearly impossible. Instead:

- **Boring morning:** the delta line stays small and grey (`+0.2 kg since last`),
  the button reads `Save`. Straight through.
- **Implausible change:** the delta becomes bold and **orange**, and the button
  relabels to name the change out loud — `Save +6.2 kg`. The value can still be
  saved; it just cannot be saved _unknowingly_.

Threshold: `1.5 kg × min(days since last entry, 7)` for weight, `2.0 %` for body
fat. Scaling by elapsed days means a week away does not cry wolf.

### Body fat is skippable — and skipping OMITS the field

Impedance readings routinely fail on dry feet. Forcing a number would mean
fabricating data.

**Critical implementation detail:** the server endpoint
`POST /api/measurements/check-in` is an **upsert keyed by `entry_date`**. Sending
`body_fat_percentage: null` would _erase_ whatever value the day already had.
So a skipped body fat must be **omitted from the request body entirely**, which
leaves the existing value untouched. This is enforced in two places:
`CheckIn.payload` (watch) omits the key, and `useWatchCheckInBridge` spreads the
field conditionally.

### Trend chart after saving, not a plain confirmation

The wearer verifies **the shape, not the digits**. A 14-day chart with a
7-day centred rolling mean and tight auto-scaling means a correct entry visibly
continues the corridor and a wrong one juts out of frame. That check is
pre-verbal and works on a barely-awake brain. Tapping through to re-log is a
clean overwrite thanks to the date-keyed upsert.

### Complication as the entry point, no notifications

Adam explicitly chose **no reminders**. A watch-face complication showing today's
value (or a hollow ring when unlogged) acts as a silent conscience without ever
nagging. **See "Not yet built" below — the complication is deferred.**

---

## Architecture

```
Watch (SwiftUI)                    Phone (RN + Expo Module)            Server
──────────────                     ─────────────────────────           ──────
CheckInEntryView
  └─ crown → CheckInStore.capture()      (local store = source of truth)
       └─ WatchSessionManager.send()
            └─ transferUserInfo ──────►  WatchConnectivityModule
                                          └─ onCheckIn event
                                               └─ useWatchCheckInBridge
                                                    └─ upsertCheckIn() ──► POST /api/measurements/check-in
                                          ◄── sendAck(clientId, ok)
       TrendView shows Saved/Queued  ◄──  updateContext(seed + history + acks)
```

### Why `transferUserInfo` and not `sendMessage`

`sendMessage` fails outright when the counterpart app isn't reachable — and in a
bathroom the phone realistically _is_ unreachable. `transferUserInfo` queues and
the system delivers later. Losing a morning's weight because the phone was
charging in the bedroom would defeat the entire feature.

Consequence, surfaced honestly in the UI: **"saved" on the watch means
"captured", not "written to the server."** Three states are shown:

| State                                        | Meaning                               | Chart                           |
| -------------------------------------------- | ------------------------------------- | ------------------------------- |
| `Saved to SparkyFitness` (green)             | Phone acked a successful server write | today's dot filled green        |
| `Saved on watch · sends near phone` (orange) | Captured, queued for delivery         | today's dot orange, 55% opacity |
| `Couldn't send · tap to retry` (red)         | Phone reported the write failed       | tappable retry                  |

Queued is framed as _complete_, because it is — the number is captured and
delivery is the system's job, not the wearer's problem.

### Why acks travel in the application context

`updateApplicationContext` is latest-value-only and survives the watch app being
asleep, so an ack still arrives if the server write completed while the watch app
was closed. `sendAck` (a direct message) is an immediate-feedback optimisation
only; it failing is harmless.

### Dedupe

The watch generates a `clientId` UUID per capture. `useWatchCheckInBridge` keeps a
set of handled ids and re-acks duplicates without writing twice —
WatchConnectivity makes no once-only delivery promise.

### Dates

The watch formats `yyyy-MM-dd` with an `en_US_POSIX` gregorian `DateFormatter` in
the **device's local timezone**, matching the phone app's convention of treating
these as calendar-day strings. `toISOString().split('T')[0]` is an anti-pattern in
this repo precisely because it shifts the day for anyone away from UTC — Adam is
UTC+1/+2.

### Seed freshness (the biggest single risk)

The design leans entirely on the seed being correct: a stale seed means every
morning starts from a wrong anchor _and_ the delta line reassures falsely.
Mitigations:

- The phone pushes fresh context on launch, on `AppState → active`, when the watch
  becomes reachable, on explicit request from the watch, and after every
  successful watch-originated write.
- A seed older than **30 days** is treated as no seed at all (`isSeedStale`), which
  routes to the typed first-run screen instead of a misleading dial.

---

## Files

### Watch — `SparkyFitnessMobile/targets/watch/`

| File                          | Role                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `SparkyFitnessWatchApp.swift` | App entry; activates session early so queued transfers start delivering before any tap          |
| `ContentView.swift`           | Router: first-run / entry / trend. Opens on entry when today is unlogged, trend when it is      |
| `CheckInEntryView.swift`      | The one-screen capture UI, crown plumbing, graduated read-back, skip, typed escape hatch        |
| `TrendView.swift`             | 14-day Swift Charts trend + rolling mean + body-fat sparkline + sync status                     |
| `CheckInStore.swift`          | Local source of truth: seed resolution, pending queue, ack application, trend data, persistence |
| `CheckInModels.swift`         | `CheckIn`, `HistoryPoint`, `WatchContext`, `SyncState`, `CheckInDate`                           |

### Phone

| File                                                           | Role                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `modules/watch-connectivity/ios/WatchConnectivityModule.swift` | Native bridge: receives check-ins, pushes context, sends acks                   |
| `modules/watch-connectivity/index.ts`                          | Typed JS surface + payload interfaces                                           |
| `src/hooks/useWatchCheckInBridge.ts`                           | Writes check-ins via `upsertCheckIn`, acks, invalidates queries, pushes context |
| `src/hooks/useWatchConnectivity.ts`                            | Read-only paired/reachable status for diagnostics                               |
| `App.tsx`                                                      | Mounts the bridge, gated on an active server connection                         |
| `src/components/DevTools.tsx`                                  | "Apple Watch" status panel (replaced the Phase 1 ping/pong test UI)             |

---

## Edge cases and how each is handled

| Case                               | Behaviour                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Phone unreachable (normal case)    | `transferUserInfo` queues; UI says "sends near phone"; today's dot drawn hollow |
| Already logged today               | Crown seeds from _today's_ value; header shows "· replacing"; upsert overwrites |
| Mis-entry during session           | Tap the small inactive value to swap focus back                                 |
| Correction later                   | App opens on trend; "Log again" re-enters capture; upsert overwrites the day    |
| Body fat unavailable               | "Skip body fat" → field omitted, existing value preserved                       |
| First-ever use / seed >30 days old | Typed first-run screen (crown has nothing to anchor to)                         |
| Genuine large jump (post-holiday)  | Long-press the number → typed entry sheet, bypassing the ±6 kg clamp            |
| Duplicate transfer delivery        | `clientId` dedupe on the phone; duplicate is re-acked, not re-written           |
| Server write fails                 | Ack `ok: false` → red retry state; check-in stays in `pending`                  |
| Offline / no server connection     | Bridge is disabled, so nothing is acked as failed; watch keeps it queued        |
| App force-quit mid-transfer        | `retryPending()` re-queues everything unconfirmed on next launch                |

---

## Not yet built (deliberate)

1. **Watch-face complication.** The agreed entry point. Needs a separate
   watchOS widget target (`targets/watch-widget/`, `type: 'watch-widget'` in
   `@bacons/apple-targets`) plus App Group sharing so the widget can read
   "logged today / last value". Deferred so the core capture flow could be
   verified on-device first. Until it exists, the app is launched from the watch
   app list.
   _Note:_ App Groups **does** work on Adam's free personal team (proven
   2026-08-17), so this does not need a paid account.
2. **Automated tests.** Jest could not run in the cloud session's Linux VM
   (`babel-jest` unresolvable through the pnpm store mount). No unit tests were
   added for `useWatchCheckInBridge`; the date/omit/dedupe logic is the part most
   worth covering.
3. **Unit switching.** kg is hardcoded end-to-end on the watch. Fine for Adam
   (Sweden, metric); blocks lbs/stone users. Server storage is already metric, so
   this is a watch-UI concern only.

## Known risks

- **Seed freshness** is the load-bearing assumption (see above).
- **Water Lock**: if active after a shower, the first crown turn is consumed
  unlocking it and the value won't move. The delta line makes this visible
  immediately, but it will be briefly confusing the first time.
- **The ±6 kg clamp is a silent wall** until the long-press hatch is discovered.
- **Threshold tuning**: 1.5 kg/day may prove too tight (a big dinner) or too
  loose. Worth revisiting after a couple of weeks of real use.

## Verification checklist (on device)

1. Log a normal value → confirm delta is grey, `Save`, green check, dot filled
   once the phone app is open.
2. Log with the phone app closed → confirm orange "sends near phone", then open
   the phone app and confirm it flips to saved and appears in Measurements.
3. Dial >2 kg from yesterday → confirm the delta turns orange and the button
   reads `Save +X.X kg`.
4. Use "Skip body fat" on a day that already has a body fat value → confirm the
   existing value is **still there** afterwards (this is the omit-vs-null test).
5. Log twice in one day → confirm the second value replaces the first rather than
   creating a duplicate row.
6. Confirm the date recorded matches the Stockholm calendar day, especially when
   logging shortly after midnight or before ~02:00.
