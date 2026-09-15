# Hydration reminders (mobile) — design

- **Issue:** [CodeWithCJ/SparkyFitness#2473](https://github.com/CodeWithCJ/SparkyFitness/issues/2473)
- **Package:** `SparkyFitnessMobile/` only. No server, shared schema, or web changes.
- **Status:** Draft, pending review.

## Problem

Users who don't log water regularly only notice a low daily total at day's
end, when it's too late to fix. The issue asks for a configurable reminder:
a push notification if the user hasn't logged any water in the last N hours.

## Scope decisions

These were resolved with the requester before writing this doc; recorded here
so the rationale isn't lost:

1. **Mobile-only, local preference.** Not synced to the server. Mobile
   already keeps every other reminder toggle (rest timer, fasting goal,
   medications) as a local `appPreferencesStore` preference, not a
   `user_preferences` column — this follows the same pattern. Web's
   "Settings → Nutrition & Diet → Water Tracking" (referenced by the issue)
   is a different, server-synced settings surface and is out of scope: web
   has no way to fire a push notification today, so a synced toggle there
   would be dead UI.
2. **Active-hours window, user-configurable.** Reminders only fire inside a
   user-set `[start, end)` time-of-day window (default `08:00`–`22:00`).
   Outside it, the countdown keeps running but no notification fires until
   the window reopens — no 3 a.m. pings.
3. **Goal-aware.** Once the day's water goal is met, reminders stop for the
   rest of that day. Resumes automatically the next day. If the user has no
   water goal configured, this check is skipped (always remind).
4. **Interval as presets, not free-form.** Four choices: 1h / 2h / 3h / 4h.
5. **Apple Watch / other wearables:** no new code. A standard local
   notification (which is what this design schedules) mirrors to a paired
   Apple Watch automatically at the OS level — the same as the existing
   rest-timer, fasting-goal, and medication-reminder notifications, none of
   which needed watch-specific code. This repo's watchOS companion app
   (`targets/watch/`, `modules/watch-connectivity/`) only exposes background
   state sync (`updateContext`) for its own screens/complications, not an
   alert/push API — building a *second*, explicit watch-side alert path was
   considered and explicitly declined as out of scope (real native-Swift
   work for a case the OS already covers). The same applies to Wear OS,
   which has no companion app in this repo at all and relies on the same
   kind of OS-level bridging.

## Why this needs a new mechanism, not just a toggle

Existing mobile local notifications are all anchored to a single fixed
future instant computed once: the rest timer schedules "now + N seconds",
the fasting goal schedules "the fast's target end time". A hydration
reminder is different — its trigger time is "last water log + N hours",
which changes every time the user drinks. The existing
`scheduleFastGoalNotification` / `FastingGoalReconciler` pair is the closest
precedent (schedule a single `DATE`-trigger notification, persist its id,
reconcile — cancel and reschedule — whenever the underlying anchor changes)
and this design reuses that shape rather than inventing a new one.

## Data already available (no server work needed)

`GET /api/v2/measurements/water-intake/{date}/log` (mobile client:
`fetchWaterIntakeLog`, already wired to the query key
`waterIntakeLogQueryKey(date)` and consumed today by
`useWatchCheckInBridge`) returns one row per logged drink with a `logged_at`
timestamp. The most recent `logged_at` across today's entries is the
reminder's anchor. `useDailySummary(date)` already exposes
`waterIntake.water_ml` and `waterGoal` for the goal-met check.

**Required fix along the way:** `useWaterIntakeMutation`'s `increment` /
`decrement` mutation and the `logPreset` mutation currently invalidate only
`dailySummaryQueryKey(date)` on success. Neither invalidates
`waterIntakeLogQueryKey(date)`, so a freshly logged drink wouldn't be visible
to the reconciler (or to `useWatchCheckInBridge`, which has the same gap
today) until something else happens to refetch that query. Both mutations
need `waterIntakeLogQueryKey(date)` added to their invalidation.

## Components

### 1. Preferences — `src/stores/appPreferencesStore.ts`

New fields, local-only, same tier as `fastingGoalNotificationsEnabled`:

```ts
waterReminderEnabled: boolean;          // default false (opt-in)
waterReminderIntervalHours: 1 | 2 | 3 | 4; // default 2
waterReminderWindowStart: string;       // 'HH:mm', default '08:00'
waterReminderWindowEnd: string;         // 'HH:mm', default '22:00'
```

With matching setters (`setWaterReminderEnabled`, etc.), added to
`PREFERENCE_DEFAULTS`, `AppPreferencesData`, `AppPreferencesState`, and the
`partialize` list. No `STORE_VERSION` bump — new keys backfill from defaults
via the existing shallow-merge migration, same as `healthTrendOrder` did.

### 2. Settings UI — `src/screens/NotificationSettingsScreen.tsx`

A new **Hydration** `SettingsRowGroup`, gated behind the existing master
`notificationsEnabled` toggle (same placement/shape as the Medications
group):

- **Water Reminders** toggle. On-handler mirrors
  `handleMedicationRemindersToggle`: request notification permission first,
  only flip the store to `true` on `'granted'` (so the toggle never shows
  "on" while silently unable to fire).
- When on, two more rows:
  - **Interval** — a `SegmentedControl` with `1h / 2h / 3h / 4h`.
  - **Active Hours** — a `Start` row and an `End` row, each opening the
    existing `TimeSheet` bottom sheet (already used for meal-type times) to
    pick an `HH:mm` value. No new time-picker component. Picking an End
    time that is not strictly after Start is rejected inline (toast, value
    not saved) — overnight windows (e.g. 22:00–08:00) are not supported in
    v1, so `computeNextReminderTime` never has to reason about a window that
    wraps midnight.

### 3. Pure scheduling logic — `src/utils/hydrationReminder.ts`

```ts
function computeNextReminderTime(
  lastLoggedAt: Date | null,
  now: Date,
  intervalHours: 1 | 2 | 3 | 4,
  windowStart: string, // 'HH:mm'
  windowEnd: string,   // 'HH:mm'
): Date;
```

Algorithm:

1. `todayWindowStart` / `todayWindowEnd` = `windowStart` / `windowEnd`
   resolved against `now`'s calendar day, in local time. `windowEnd` is
   always strictly after `windowStart` on the same day — the UI rejects any
   other combination (see Settings UI below), so this function never has to
   handle a window that wraps midnight.
2. `anchor = max(lastLoggedAt ?? -Infinity, todayWindowStart)` — a stale log
   from a prior day never anchors today's countdown; the window opening does.
3. `candidate = anchor + intervalHours`.
4. If `candidate < todayWindowStart` → return `todayWindowStart` (countdown
   satisfied before the window even opened; remind right at open).
5. If `candidate > todayWindowEnd` → return **tomorrow's** `windowStart` (a
   new day has no log against it yet, so the "haven't logged recently"
   condition is already true at window open).
6. Otherwise return `candidate`.

No goal-met / enabled checks here — this function is pure and only knows
about time. The caller (the reconciler) decides whether to call it at all.

Unit-testable in isolation, no AsyncStorage/native mocks required.

### 4. Notification scheduling — `src/services/notifications.ts`

New, mirroring `scheduleFastGoalNotification`:

- `HYDRATION_CHANNEL_ID = 'hydration'` Android channel, registered in
  `registerLocalizedNotificationPresentation`.
- `scheduleWaterReminderNotification(targetTime: Date): Promise<string | null>`
  — same shape as `scheduleFastGoalNotification`: checks
  `notificationsEnabled && waterReminderEnabled`, requests permission,
  schedules a `DATE`-trigger notification, returns the id or `null`.
- `cancelWaterReminderNotification` helper, called when
  `setWaterReminderEnabled(false)` (new setter alongside
  `setRestTimerNotificationsEnabled`, following the same
  toggle-off-cancels-pending-alert pattern).

### 5. Reconciler hook + component — `src/hooks/useHydrationReminder.ts`, `src/components/HydrationReminderReconciler.tsx`

Directly mirrors `useFastingGoalReconciler` / `FastingGoalReconciler`:

- A persisted AsyncStorage record (`@SparkyFitness/waterReminderNotificationId`)
  storing `{ date, anchorTimestampMs, notificationId }`. Reconciliation is a
  no-op when today's date and anchor haven't changed since the last run —
  same idempotency guard as `StoredGoalNotification`.
- `useHydrationReminderReconciler(waterMl, waterGoalMl, lastLoggedAt,
isLoading)`:
  - If `waterReminderEnabled` is off (or the master `notificationsEnabled`
    is off): cancel any pending reminder, clear the stored record, return.
  - If `waterGoalMl` is set and `waterMl >= waterGoalMl`: cancel any pending
    reminder for today (goal met, nothing to remind about), but do **not**
    clear the stored record's `date` — so a goal un-met later today (e.g. a
    goal edit) can reschedule via the normal effect re-run.
  - Otherwise: compute `computeNextReminderTime(lastLoggedAt, new Date(),
    intervalHours, windowStart, windowEnd)`, compare against the stored
    record; if different, cancel the old id, schedule the new one, persist
    the new record.
- `HydrationReminderReconciler.tsx`: headless component, reads
  `useDailySummary(today)` for `waterMl`/`waterGoalMl` and a small query on
  `waterIntakeLogQueryKey(today)` (shares cache with
  `useWatchCheckInBridge` when both are mounted — no duplicate fetch) for
  `lastLoggedAt`, and calls the hook above. Mounted unconditionally on
  `DashboardScreen`, next to `FastingGoalReconciler`, so it keeps running
  even when the hydration card itself is hidden.
- App-resume refetch: same pattern as the fasting reconciler, so a log made
  on another device (or a day rollover while the app was backgrounded) is
  picked up promptly.

### 6. `DashboardScreen.tsx`

Mount `<HydrationReminderReconciler />` alongside the existing
`<FastingGoalReconciler />`.

## Notification content

Title/body follow the existing copy pattern
(`notifications.fasting.title` / `.body` style keys):

- `notifications.hydration.title` — "Time to hydrate"
- `notifications.hydration.body` — "You haven't logged any water in a
  while."

No action buttons in v1 (unlike medication reminders) — tapping opens the
app to the Dashboard, same default behavior as the fasting-goal
notification.

## Error handling

- No water container configured / `useWaterIntakeMutation` reporting
  `isReady: false`: the reconciler still schedules reminders (a reminder is
  a nudge to open the app and log, which is useful even without a default
  container — `noContainerAlert` already handles that path once they tap
  in-app).
- Permission denied: `scheduleWaterReminderNotification` returns `null`, the
  same as every other schedule function; the reconciler treats a `null`
  return as "nothing scheduled" and does not retry in a loop — it will
  naturally retry on the next reconcile trigger (log, resume, settings
  change).
- Notification scheduling failures are logged via `addLog(..., 'ERROR')`,
  matching every other function in `notifications.ts`.

## Testing

- `utils/hydrationReminder.test.ts` — `computeNextReminderTime` unit tests:
  mid-window candidate, before-window clamp, after-window rollover to
  tomorrow, no prior log today, log from a prior day (must not anchor
  today).
- `hooks/useHydrationReminder.test.ts` — reconciler hook: schedule on first
  run, no-op on unchanged anchor, reschedule on new log, cancel on
  goal-met, cancel on toggle-off, mirroring the structure of the existing
  fasting reconciler tests.
- `screens/NotificationSettingsScreen.test.tsx` — new Hydration group:
  toggle on/off, permission-denied path leaves toggle off, interval
  selection, time-sheet interaction for start/end.
- `hooks/useWaterIntakeMutation.test.ts` — assert the new
  `waterIntakeLogQueryKey(date)` invalidation on increment/decrement and
  `logPreset` success.

## Out of scope (explicitly, per the decisions above)

- Any server/shared-schema/migration change.
- Web frontend UI.
- New WatchConnectivity message API / watch-side alert UI.
- Wear OS / Android companion app.
