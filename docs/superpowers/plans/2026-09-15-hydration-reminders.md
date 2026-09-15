# Hydration Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let mobile users opt into local notifications that remind them to drink when they haven't logged water for 1–4 hours, only inside a configurable time-of-day window, stopping for the day once the water goal is met.

**Architecture:** Four local preferences in `appPreferencesStore`. A pure function computes a bounded chain of reminder times from the last `logged_at`. A reconciler, modeled on the fasting-goal reconciler, keeps that chain scheduled as `DATE`-trigger local notifications. It runs from a headless component on the Dashboard, reads today's summary and water log from React Query, and cancels and reschedules whenever the result would change. Paired watches get the notifications through normal OS mirroring, so there is no watch code.

**Tech Stack:** React Native 0.86 / Expo SDK 57, TypeScript (strict), Zustand `persist`, TanStack Query 5, `expo-notifications`, i18next, Jest (`jest-expo`) + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-09-15-hydration-reminders-design.md` (read it; the amendments below override it where they differ)

## Global Constraints

- Package: `SparkyFitnessMobile/` only. No server, `shared/`, migration, or web changes.
- Run every command from `SparkyFitnessMobile/` unless a step says otherwise.
- Jest: always `pnpm exec jest --watchman=false --runInBand <path>`.
- Never use `any` or `eslint-disable` for `no-explicit-any` (repo rule).
- Only edit `src/localization/locales/en/translation.json`. Every `t()` `defaultValue` must match its English catalog entry exactly.
- Commits: conventional style (`feat(mobile): …`). **No AI attribution of any kind** — no `Co-Authored-By` trailer, no "Generated with" line (`AGENTS.md`, overrides harness defaults).
- Stage files by explicit path. Never stage `pnpm-lock.yaml` or `.npmrc` (both carry unrelated pre-existing local changes).
- Reminder defaults: disabled, every 2 hours, window `08:00`–`22:00`. Interval options are exactly `1 | 2 | 3 | 4` hours.
- At most `12` reminder notifications pending at once.
- Window is half-open `[start, end)`; `end` must be strictly after `start` on the same day.

## Spec amendments (decided while planning)

These close gaps found while tracing the spec against the code:

1. **A chain of reminders, not a single notification.** A single `DATE` notification fires once, and nothing reschedules it until the app runs again. That would give at most one reminder per app session and break "keep reminding until you drink." The reconciler therefore schedules up to 12 upcoming reminder times, each `intervalHours` apart and each moved inside the window (rolling to the next day's start when needed). Logging water cancels the chain and schedules a fresh one.
2. **Goal met → the chain starts at tomorrow's window start**, instead of cancelling everything. Cancelling everything would silently kill tomorrow's reminders for anyone who doesn't open the app tomorrow.
3. **No "no goal configured" branch.** `buildDailySummary` already falls back to a 2500 ml `waterGoal`, and the Dashboard shows that value as the user's goal. The reconciler uses the same number, so reminders and UI always agree.
4. **A reminder already overdue fires 1 minute from now** (`MIN_REMINDER_LEAD_MS`), not at a time in the past.
5. **Toggle-off cancellation lives in the reconciler effect** (exactly how fasting does it), not in a new setter inside `notifications.ts`. Putting it in `notifications.ts` would create a hooks ↔ service import cycle.
6. **The pure function is `computeReminderSchedule(...) => Date[]`**, replacing the spec's `computeNextReminderTime(...) => Date`.

Task 8 records these in the spec document.

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/stores/appPreferencesStore.ts` | Modify | 4 persisted preferences + setters, interval option list/type |
| `src/utils/hydrationReminder.ts` | Create | Pure time math: `computeReminderSchedule`, `isValidReminderWindow`, `latestLoggedAt` |
| `src/services/notifications.ts` | Modify | `hydration` Android channel, `scheduleWaterReminderNotifications(times)` |
| `src/hooks/useHydrationReminder.ts` | Create | Persisted schedule record, serialized `reconcileWaterReminders` / `cancelWaterReminders`, `useHydrationReminderReconciler` |
| `src/components/HydrationReminderReconciler.tsx` | Create | Headless: today's summary + water log → reconciler hook |
| `src/screens/DashboardScreen.tsx` | Modify | Mount the headless reconciler |
| `src/hooks/useWaterIntakeMutation.ts` | Modify | Also invalidate `waterIntakeLogQueryKey(date)` after logging |
| `src/screens/NotificationSettingsScreen.tsx` | Modify | Hydration group: toggle, interval, start/end time |
| `src/localization/locales/en/translation.json` | Modify | English copy |
| `AGENTS.md` (mobile) and the spec | Modify | Documentation |
| `__tests__/stores/appPreferencesStore.waterReminder.test.ts` | Create | Store tests |
| `__tests__/utils/hydrationReminder.test.ts` | Create | Pure function tests |
| `__tests__/services/notifications.test.ts` | Modify | Scheduling + channel tests |
| `__tests__/hooks/useHydrationReminder.test.ts` | Create | Reconcile + hook tests |
| `__tests__/components/HydrationReminderReconciler.test.tsx` | Create | Headless component tests |
| `__tests__/hooks/useWaterIntakeMutation.test.ts` | Modify | Invalidation tests |
| `__tests__/screens/NotificationSettingsScreen.test.tsx` | Modify | Settings UI tests |

---

### Task 1: Water reminder preferences

**Files:**
- Modify: `src/stores/appPreferencesStore.ts`
- Test: `__tests__/stores/appPreferencesStore.waterReminder.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const WATER_REMINDER_INTERVAL_OPTIONS = [1, 2, 3, 4] as const;`
  - `export type WaterReminderIntervalHours = (typeof WATER_REMINDER_INTERVAL_OPTIONS)[number];`
  - State fields: `waterReminderEnabled: boolean`, `waterReminderIntervalHours: WaterReminderIntervalHours`, `waterReminderWindowStart: string`, `waterReminderWindowEnd: string`
  - Setters: `setWaterReminderEnabled(value: boolean)`, `setWaterReminderIntervalHours(value: WaterReminderIntervalHours)`, `setWaterReminderWindow(start: string, end: string)`

- [ ] **Step 0: Create the feature branch** (from the repo root)

```bash
git checkout -b feat/mobile-hydration-reminders
```

- [ ] **Step 1: Write the failing test**

Create `__tests__/stores/appPreferencesStore.waterReminder.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitFor } from '@testing-library/react-native';
import {
  WATER_REMINDER_INTERVAL_OPTIONS,
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

const STORE_KEY = '@SparkyFitness/app-preferences';

describe('water reminder preferences', () => {
  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
  });

  it('defaults to off, every 2 hours, from 08:00 to 22:00', () => {
    const state = useAppPreferencesStore.getState();
    expect(state.waterReminderEnabled).toBe(false);
    expect(state.waterReminderIntervalHours).toBe(2);
    expect(state.waterReminderWindowStart).toBe('08:00');
    expect(state.waterReminderWindowEnd).toBe('22:00');
  });

  it('offers exactly the 1, 2, 3 and 4 hour intervals', () => {
    expect(WATER_REMINDER_INTERVAL_OPTIONS).toEqual([1, 2, 3, 4]);
  });

  it('updates each field through its setter', () => {
    const store = useAppPreferencesStore.getState();
    store.setWaterReminderEnabled(true);
    store.setWaterReminderIntervalHours(3);
    store.setWaterReminderWindow('07:30', '21:00');

    const state = useAppPreferencesStore.getState();
    expect(state.waterReminderEnabled).toBe(true);
    expect(state.waterReminderIntervalHours).toBe(3);
    expect(state.waterReminderWindowStart).toBe('07:30');
    expect(state.waterReminderWindowEnd).toBe('21:00');
  });

  it('persists the water reminder fields', async () => {
    const store = useAppPreferencesStore.getState();
    store.setWaterReminderEnabled(true);
    store.setWaterReminderIntervalHours(4);
    store.setWaterReminderWindow('09:00', '20:00');

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      expect(raw).not.toBeNull();
      const { state } = JSON.parse(raw as string);
      expect(state).toEqual(
        expect.objectContaining({
          waterReminderEnabled: true,
          waterReminderIntervalHours: 4,
          waterReminderWindowStart: '09:00',
          waterReminderWindowEnd: '20:00',
        })
      );
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/stores/appPreferencesStore.waterReminder.test.ts`
Expected: FAIL — `WATER_REMINDER_INTERVAL_OPTIONS` is undefined and the setters are not functions.

- [ ] **Step 3: Implement**

In `src/stores/appPreferencesStore.ts`:

(a) Directly after `export type ActiveWorkoutMetricColumn = 'rpe' | 'volume' | 'e1rm' | 'tenrm';` add:

```ts

/** Hours without a water log before a hydration reminder fires. */
export const WATER_REMINDER_INTERVAL_OPTIONS = [1, 2, 3, 4] as const;
export type WaterReminderIntervalHours =
  (typeof WATER_REMINDER_INTERVAL_OPTIONS)[number];
```

(b) In `PREFERENCE_DEFAULTS`, directly after `  medicationReminderHideNames: false,` add:

```ts
  waterReminderEnabled: false,
  waterReminderIntervalHours: 2 as WaterReminderIntervalHours,
  waterReminderWindowStart: '08:00' as string,
  waterReminderWindowEnd: '22:00' as string,
```

(c) In `AppPreferencesData`, directly after `  medicationReminderHideNames: boolean;` add:

```ts
  waterReminderEnabled: boolean;
  waterReminderIntervalHours: WaterReminderIntervalHours;
  waterReminderWindowStart: string;
  waterReminderWindowEnd: string;
```

(d) In `AppPreferencesState`, directly after `  setMedicationReminderHideNames: (value: boolean) => void;` add:

```ts
  setWaterReminderEnabled: (value: boolean) => void;
  setWaterReminderIntervalHours: (value: WaterReminderIntervalHours) => void;
  setWaterReminderWindow: (start: string, end: string) => void;
```

(e) In the store body, directly after the `setMedicationReminderHideNames` implementation (`        set({ medicationReminderHideNames: value }),`) add:

```ts
      setWaterReminderEnabled: (value) => set({ waterReminderEnabled: value }),
      setWaterReminderIntervalHours: (value) =>
        set({ waterReminderIntervalHours: value }),
      setWaterReminderWindow: (start, end) =>
        set({ waterReminderWindowStart: start, waterReminderWindowEnd: end }),
```

(f) In `partialize`, directly after `        medicationReminderHideNames: state.medicationReminderHideNames,` add:

```ts
        waterReminderEnabled: state.waterReminderEnabled,
        waterReminderIntervalHours: state.waterReminderIntervalHours,
        waterReminderWindowStart: state.waterReminderWindowStart,
        waterReminderWindowEnd: state.waterReminderWindowEnd,
```

Do not bump `STORE_VERSION`. Older persisted state doesn't have these keys, and zustand's shallow merge fills them from the defaults.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/stores/appPreferencesStore.waterReminder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/appPreferencesStore.ts __tests__/stores/appPreferencesStore.waterReminder.test.ts
git commit -m "feat(mobile): add hydration reminder preferences"
```

---

### Task 2: Reminder schedule math

**Files:**
- Create: `src/utils/hydrationReminder.ts`
- Test: `__tests__/utils/hydrationReminder.test.ts` (create)

**Interfaces:**
- Consumes: nothing (pure; no imports from Task 1).
- Produces:
  - `export const MAX_SCHEDULED_WATER_REMINDERS = 12;`
  - `export const MIN_REMINDER_LEAD_MS = 60_000;`
  - `export interface ReminderScheduleInput { lastLoggedAt: Date | null; now: Date; intervalHours: number; windowStart: string; windowEnd: string; goalMetToday: boolean; }`
  - `export function computeReminderSchedule(input: ReminderScheduleInput): Date[]` — always returns exactly `MAX_SCHEDULED_WATER_REMINDERS` ascending dates, every one inside `[windowStart, windowEnd)` on its own day
  - `export function isValidReminderWindow(start: string, end: string): boolean`
  - `export function latestLoggedAt(entries: ReadonlyArray<{ logged_at: string }> | undefined): Date | null`

- [ ] **Step 1: Write the failing test**

Create `__tests__/utils/hydrationReminder.test.ts`. All dates use the local-time `Date` constructor (month is 0-based: `8` = September), so results don't depend on the machine's timezone.

```ts
import {
  MAX_SCHEDULED_WATER_REMINDERS,
  computeReminderSchedule,
  isValidReminderWindow,
  latestLoggedAt,
  type ReminderScheduleInput,
} from '../../src/utils/hydrationReminder';

const at = (day: number, hours: number, minutes = 0) =>
  new Date(2026, 8, day, hours, minutes, 0, 0);

function input(overrides: Partial<ReminderScheduleInput>): ReminderScheduleInput {
  return {
    lastLoggedAt: null,
    now: at(15, 12),
    intervalHours: 2,
    windowStart: '08:00',
    windowEnd: '22:00',
    goalMetToday: false,
    ...overrides,
  };
}

describe('computeReminderSchedule', () => {
  it('reminds one interval after the last log', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 12), lastLoggedAt: at(15, 11) })
    );
    expect(times[0]).toEqual(at(15, 13));
  });

  it('counts from the window start when nothing was logged today', () => {
    const times = computeReminderSchedule(input({ now: at(15, 9) }));
    expect(times[0]).toEqual(at(15, 10));
  });

  it('never anchors today on a log from a previous day', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 9), lastLoggedAt: at(14, 21) })
    );
    expect(times[0]).toEqual(at(15, 10));
  });

  it('fires one minute from now when the reminder is already overdue', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 15), lastLoggedAt: at(15, 9) })
    );
    expect(times[0]).toEqual(at(15, 15, 1));
  });

  it("rolls past the window end to tomorrow's window start", () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 21, 30), lastLoggedAt: at(15, 21) })
    );
    expect(times[0]).toEqual(at(16, 8));
  });

  it('treats the window end as exclusive', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 20), lastLoggedAt: at(15, 20) })
    );
    expect(times[0]).toEqual(at(16, 8));
  });

  it('moves a reminder that lands after midnight to that morning’s window start', () => {
    const times = computeReminderSchedule(
      input({
        now: at(15, 23),
        lastLoggedAt: at(15, 23),
        intervalHours: 1,
        windowEnd: '23:30',
      })
    );
    expect(times[0]).toEqual(at(16, 8));
  });

  it("starts at tomorrow's window start once today's goal is met", () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 12), lastLoggedAt: at(15, 11), goalMetToday: true })
    );
    expect(times[0]).toEqual(at(16, 8));
  });

  it('schedules a bounded, ascending chain that stays inside the window', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 19), lastLoggedAt: at(15, 19) })
    );
    expect(times).toHaveLength(MAX_SCHEDULED_WATER_REMINDERS);
    expect(times[0]).toEqual(at(15, 21));
    expect(times[1]).toEqual(at(16, 8));
    expect(times[2]).toEqual(at(16, 10));
    for (let i = 0; i < times.length; i += 1) {
      const minutes = times[i].getHours() * 60 + times[i].getMinutes();
      expect(minutes).toBeGreaterThanOrEqual(8 * 60);
      expect(minutes).toBeLessThan(22 * 60);
      if (i > 0) {
        expect(times[i].getTime()).toBeGreaterThan(times[i - 1].getTime());
      }
    }
  });

  it('terminates when the window is shorter than the interval', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 7), windowStart: '08:00', windowEnd: '09:00' })
    );
    expect(times).toHaveLength(MAX_SCHEDULED_WATER_REMINDERS);
    expect(times[0]).toEqual(at(16, 8));
    expect(times[1]).toEqual(at(17, 8));
  });
});

describe('isValidReminderWindow', () => {
  it('accepts an end strictly after the start', () => {
    expect(isValidReminderWindow('08:00', '22:00')).toBe(true);
  });

  it('rejects an equal or earlier end', () => {
    expect(isValidReminderWindow('08:00', '08:00')).toBe(false);
    expect(isValidReminderWindow('22:00', '08:00')).toBe(false);
  });

  it('rejects malformed times', () => {
    expect(isValidReminderWindow('8:00', '22:00')).toBe(false);
    expect(isValidReminderWindow('08:00', '24:00')).toBe(false);
  });
});

describe('latestLoggedAt', () => {
  it('returns the most recent logged_at', () => {
    expect(
      latestLoggedAt([
        { logged_at: '2026-09-15T08:00:00.000Z' },
        { logged_at: '2026-09-15T10:30:00.000Z' },
        { logged_at: '2026-09-15T09:15:00.000Z' },
      ])
    ).toEqual(new Date('2026-09-15T10:30:00.000Z'));
  });

  it('ignores unparseable timestamps', () => {
    expect(
      latestLoggedAt([
        { logged_at: 'not-a-date' },
        { logged_at: '2026-09-15T08:00:00.000Z' },
      ])
    ).toEqual(new Date('2026-09-15T08:00:00.000Z'));
  });

  it('returns null with no entries', () => {
    expect(latestLoggedAt([])).toBeNull();
    expect(latestLoggedAt(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/utils/hydrationReminder.test.ts`
Expected: FAIL — `Cannot find module '../../src/utils/hydrationReminder'`.

- [ ] **Step 3: Implement**

Create `src/utils/hydrationReminder.ts`:

```ts
const HOUR_MS = 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Upper bound on pending reminders; iOS caps an app at 64 pending notifications. */
export const MAX_SCHEDULED_WATER_REMINDERS = 12;

/** An already-overdue reminder fires this long from now rather than in the past. */
export const MIN_REMINDER_LEAD_MS = 60_000;

export interface ReminderScheduleInput {
  lastLoggedAt: Date | null;
  now: Date;
  intervalHours: number;
  windowStart: string;
  windowEnd: string;
  goalMetToday: boolean;
}

function atTimeOnDay(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(day.getTime());
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function nextDayAt(day: Date, time: string): Date {
  const result = new Date(day.getTime());
  result.setDate(result.getDate() + 1);
  return atTimeOnDay(result, time);
}

function fitIntoWindow(time: Date, windowStart: string, windowEnd: string): Date {
  const start = atTimeOnDay(time, windowStart);
  if (time.getTime() < start.getTime()) return start;
  const end = atTimeOnDay(time, windowEnd);
  if (time.getTime() >= end.getTime()) return nextDayAt(time, windowStart);
  return time;
}

/**
 * Upcoming reminder times, each inside `[windowStart, windowEnd)` on its own
 * day. A chain rather than one time because a scheduled notification cannot
 * reschedule itself: without the app running, one ping would be the last.
 */
export function computeReminderSchedule({
  lastLoggedAt,
  now,
  intervalHours,
  windowStart,
  windowEnd,
  goalMetToday,
}: ReminderScheduleInput): Date[] {
  const intervalMs = intervalHours * HOUR_MS;

  let next: Date;
  if (goalMetToday) {
    next = nextDayAt(now, windowStart);
  } else {
    const todayStartMs = atTimeOnDay(now, windowStart).getTime();
    const anchorMs = Math.max(lastLoggedAt?.getTime() ?? todayStartMs, todayStartMs);
    next = fitIntoWindow(
      new Date(Math.max(anchorMs + intervalMs, now.getTime() + MIN_REMINDER_LEAD_MS)),
      windowStart,
      windowEnd
    );
  }

  const times = [next];
  while (times.length < MAX_SCHEDULED_WATER_REMINDERS) {
    next = fitIntoWindow(new Date(next.getTime() + intervalMs), windowStart, windowEnd);
    times.push(next);
  }
  return times;
}

/** Same-day windows only: overnight windows are not supported. */
export function isValidReminderWindow(start: string, end: string): boolean {
  return TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && end > start;
}

export function latestLoggedAt(
  entries: ReadonlyArray<{ logged_at: string }> | undefined
): Date | null {
  let latestMs: number | null = null;
  for (const entry of entries ?? []) {
    const ms = new Date(entry.logged_at).getTime();
    if (Number.isNaN(ms)) continue;
    if (latestMs === null || ms > latestMs) latestMs = ms;
  }
  return latestMs === null ? null : new Date(latestMs);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/utils/hydrationReminder.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/hydrationReminder.ts __tests__/utils/hydrationReminder.test.ts
git commit -m "feat(mobile): compute hydration reminder schedule"
```

---

### Task 3: Schedule reminder notifications

**Files:**
- Modify: `src/services/notifications.ts`
- Modify: `src/localization/locales/en/translation.json`
- Test: `__tests__/services/notifications.test.ts`

**Interfaces:**
- Consumes: from Task 1, the store fields `notificationsEnabled` and `waterReminderEnabled`.
- Produces: `export async function scheduleWaterReminderNotifications(times: Date[]): Promise<string[]>` — returns the IDs actually scheduled. Returns `[]` when either preference is off or the OS permission isn't already granted; it never prompts. Past or invalid times are skipped.

- [ ] **Step 1: Write the failing tests**

In `__tests__/services/notifications.test.ts`:

(a) Add `scheduleWaterReminderNotifications,` to the import list from `'../../src/services/notifications'` (keep the list alphabetical: insert it after `scheduleRestNotification,`).

(b) Inside `describe('initNotifications', ...)`, directly after the `it('creates a dedicated fasting Android channel', ...)` test, add:

```ts
    it('creates a dedicated hydration Android channel', async () => {
      Object.defineProperty(Platform, 'OS', {
        get: () => 'android',
        configurable: true,
      });
      await initNotifications();
      expect(mockSetChannel).toHaveBeenCalledWith(
        'hydration',
        expect.objectContaining({ name: 'Hydration reminders' })
      );
    });
```

(c) Directly after the whole `describe('scheduleFastGoalNotification', ...)` block, add:

```ts
  describe('scheduleWaterReminderNotifications', () => {
    const inHours = (hours: number) =>
      new Date(Date.now() + hours * 60 * 60 * 1000);

    beforeEach(() => {
      useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    });

    it('schedules each future time as a DATE notification on the hydration channel', async () => {
      mockSchedule
        .mockResolvedValueOnce('water-1' as any)
        .mockResolvedValueOnce('water-2' as any);

      const ids = await scheduleWaterReminderNotifications([
        inHours(1),
        inHours(3),
      ]);

      expect(ids).toEqual(['water-1', 'water-2']);
      expect(mockSchedule).toHaveBeenCalledTimes(2);
      expect(mockSchedule).toHaveBeenCalledWith({
        content: expect.objectContaining({
          title: 'Time to hydrate',
          body: "You haven't logged any water in a while.",
        }),
        trigger: expect.objectContaining({
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          channelId: 'hydration',
        }),
      });
    });

    it('skips times that are already in the past', async () => {
      const ids = await scheduleWaterReminderNotifications([
        new Date(Date.now() - 60 * 1000),
        inHours(1),
      ]);
      expect(ids).toEqual(['notif-id']);
      expect(mockSchedule).toHaveBeenCalledTimes(1);
    });

    it('schedules nothing while the water reminder toggle is off', async () => {
      useAppPreferencesStore.getState().setWaterReminderEnabled(false);
      expect(await scheduleWaterReminderNotifications([inHours(1)])).toEqual([]);
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('schedules nothing while the master notifications toggle is off', async () => {
      useAppPreferencesStore.getState().setNotificationsEnabled(false);
      expect(await scheduleWaterReminderNotifications([inHours(1)])).toEqual([]);
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('never prompts and schedules nothing without OS permission', async () => {
      mockGetPerms.mockResolvedValue({ status: 'undetermined' } as any);
      expect(await scheduleWaterReminderNotifications([inHours(1)])).toEqual([]);
      expect(mockRequestPerms).not.toHaveBeenCalled();
      expect(mockSchedule).not.toHaveBeenCalled();
    });
  });
```

(This file already uses `as any` on mock resolutions throughout. Leave that in place and don't spread it into new source files.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/services/notifications.test.ts`
Expected: FAIL — `scheduleWaterReminderNotifications is not a function`, and the hydration channel test fails.

- [ ] **Step 3: Add the English copy**

In `src/localization/locales/en/translation.json`:

(a) Replace

```json
      "workoutTimer": "Workout timer",
      "fasting": "Fasting"
    },
```

with

```json
      "workoutTimer": "Workout timer",
      "fasting": "Fasting",
      "hydration": "Hydration reminders"
    },
```

(b) Replace

```json
    "fasting": {
      "title": "Fasting goal reached",
      "body": "You've hit your fasting goal. Great work!"
    }
  },
```

with

```json
    "fasting": {
      "title": "Fasting goal reached",
      "body": "You've hit your fasting goal. Great work!"
    },
    "hydration": {
      "title": "Time to hydrate",
      "body": "You haven't logged any water in a while."
    }
  },
```

- [ ] **Step 4: Implement**

In `src/services/notifications.ts`:

(a) Directly after `const FASTING_CHANNEL_ID = 'fasting';` add:

```ts
const HYDRATION_CHANNEL_ID = 'hydration';
```

(b) In `registerLocalizedNotificationPresentation`, register the channel **between** the fasting channel and the medication channel. The existing i18n test expects the medication channel to be registered last, so the order matters. Directly after the fasting `setNotificationChannelAsync(FASTING_CHANNEL_ID, {...});` call add:

```ts
    await Notifications.setNotificationChannelAsync(HYDRATION_CHANNEL_ID, {
      name: notificationCopy(
        'notifications.channels.hydration',
        'Hydration reminders'
      ),
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
    });
```

(c) Directly after the `scheduleFastGoalNotification` function, add:

```ts
/**
 * Schedules one hydration reminder per future time and returns the ids that
 * were scheduled. Never prompts for permission: this runs from a background
 * reconcile, and the settings toggle only turns on once permission is granted.
 */
export async function scheduleWaterReminderNotifications(
  times: Date[]
): Promise<string[]> {
  const prefs = useAppPreferencesStore.getState();
  if (!prefs.notificationsEnabled || !prefs.waterReminderEnabled) return [];
  if (!(await hasNotificationPermission())) return [];

  const nowMs = Date.now();
  const ids: string[] = [];
  for (const time of times) {
    const timeMs = time.getTime();
    if (Number.isNaN(timeMs) || timeMs <= nowMs) continue;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: notificationCopy(
            'notifications.hydration.title',
            'Time to hydrate'
          ),
          body: notificationCopy(
            'notifications.hydration.body',
            "You haven't logged any water in a while."
          ),
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: time,
          channelId: HYDRATION_CHANNEL_ID,
        },
      });
      ids.push(id);
    } catch (err) {
      addLog(
        `scheduleWaterReminderNotifications failed: ${(err as Error).message}`,
        'ERROR'
      );
    }
  }
  return ids;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/services/notifications.test.ts`
Expected: PASS — the whole file, including the existing `registers localized Android presentation` test, which still sees `medication-reminders` registered last.

- [ ] **Step 6: Commit**

```bash
git add src/services/notifications.ts src/localization/locales/en/translation.json __tests__/services/notifications.test.ts
git commit -m "feat(mobile): schedule hydration reminder notifications"
```

---

### Task 4: Reconcile the reminder schedule

**Files:**
- Create: `src/hooks/useHydrationReminder.ts`
- Test: `__tests__/hooks/useHydrationReminder.test.ts` (create)

**Interfaces:**
- Consumes:
  - From Task 1: `WaterReminderIntervalHours`, plus the store fields `notificationsEnabled`, `waterReminderEnabled`, `waterReminderIntervalHours`, `waterReminderWindowStart`, and `waterReminderWindowEnd`.
  - From Task 2: `computeReminderSchedule(input: ReminderScheduleInput): Date[]`.
  - From Task 3: `scheduleWaterReminderNotifications(times: Date[]): Promise<string[]>`.
  - Existing: `cancelScheduledNotification(id: string | null): Promise<void>`.
- Produces:
  - `export interface WaterReminderReconcileInput { today: string; lastLoggedAt: Date | null; goalMetToday: boolean; intervalHours: WaterReminderIntervalHours; windowStart: string; windowEnd: string; language?: string | null; }`
  - `export function reconcileWaterReminders(input: WaterReminderReconcileInput, now?: Date): Promise<void>`
  - `export function cancelWaterReminders(): Promise<void>`
  - `export interface HydrationReminderReconcilerInput { today: string; lastLoggedAt: Date | null; waterMl: number; waterGoalMl: number | null; isLoading: boolean; refetch: () => void; }`
  - `export function useHydrationReminderReconciler(input: HydrationReminderReconcilerInput): void`
  - `export function __resetWaterReminderStateForTests(): void`

- [ ] **Step 1: Write the failing test**

Create `__tests__/hooks/useHydrationReminder.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import {
  cancelWaterReminders,
  reconcileWaterReminders,
  useHydrationReminderReconciler,
  __resetWaterReminderStateForTests,
  type HydrationReminderReconcilerInput,
  type WaterReminderReconcileInput,
} from '../../src/hooks/useHydrationReminder';
import {
  cancelScheduledNotification,
  scheduleWaterReminderNotifications,
} from '../../src/services/notifications';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/notifications', () => ({
  scheduleWaterReminderNotifications: jest.fn(),
  cancelScheduledNotification: jest.fn(),
}));

const mockSchedule = scheduleWaterReminderNotifications as jest.MockedFunction<
  typeof scheduleWaterReminderNotifications
>;
const mockCancel = cancelScheduledNotification as jest.MockedFunction<
  typeof cancelScheduledNotification
>;

const STORAGE_KEY = '@SparkyFitness/waterReminderSchedule';
const at = (day: number, hours: number, minutes = 0) =>
  new Date(2026, 8, day, hours, minutes, 0, 0);
const NOW = at(15, 9, 30);

function reconcileInput(
  overrides: Partial<WaterReminderReconcileInput> = {}
): WaterReminderReconcileInput {
  return {
    today: '2026-09-15',
    lastLoggedAt: at(15, 9),
    goalMetToday: false,
    intervalHours: 2,
    windowStart: '08:00',
    windowEnd: '22:00',
    ...overrides,
  };
}

async function storedIds(): Promise<string[] | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw).notificationIds : null;
}

beforeEach(async () => {
  __resetWaterReminderStateForTests();
  __resetAppPreferencesStoreForTests();
  await AsyncStorage.clear();
  mockSchedule.mockReset().mockResolvedValue(['n1', 'n2']);
  mockCancel.mockReset().mockResolvedValue(undefined);
});

describe('reconcileWaterReminders', () => {
  it('schedules the chain computed from the last log and remembers the ids', async () => {
    await reconcileWaterReminders(reconcileInput(), NOW);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const times = mockSchedule.mock.calls[0][0];
    expect(times[0]).toEqual(at(15, 11));
    expect(times).toHaveLength(12);
    expect(await storedIds()).toEqual(['n1', 'n2']);
  });

  it('is a no-op when nothing relevant changed', async () => {
    await reconcileWaterReminders(reconcileInput(), NOW);
    await reconcileWaterReminders(reconcileInput(), NOW);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('replaces the chain when a new drink is logged', async () => {
    await reconcileWaterReminders(reconcileInput(), NOW);
    mockSchedule.mockResolvedValueOnce(['n3']);

    await reconcileWaterReminders(
      reconcileInput({ lastLoggedAt: at(15, 10) }),
      at(15, 10)
    );

    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(mockCancel).toHaveBeenCalledWith('n2');
    expect(mockSchedule.mock.calls[1][0][0]).toEqual(at(15, 12));
    expect(await storedIds()).toEqual(['n3']);
  });

  it("moves the chain to tomorrow's window once today's goal is met", async () => {
    await reconcileWaterReminders(reconcileInput(), NOW);
    await reconcileWaterReminders(reconcileInput({ goalMetToday: true }), NOW);

    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(mockSchedule.mock.calls[1][0][0]).toEqual(at(16, 8));
  });

  it('retries on the next reconcile when nothing could be scheduled', async () => {
    mockSchedule.mockResolvedValueOnce([]);
    await reconcileWaterReminders(reconcileInput(), NOW);
    expect(await storedIds()).toBeNull();

    await reconcileWaterReminders(reconcileInput(), NOW);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    expect(await storedIds()).toEqual(['n1', 'n2']);
  });
});

describe('cancelWaterReminders', () => {
  it('cancels and forgets the scheduled chain', async () => {
    await reconcileWaterReminders(reconcileInput(), NOW);
    await cancelWaterReminders();

    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(mockCancel).toHaveBeenCalledWith('n2');
    expect(await storedIds()).toBeNull();
  });

  it('no-ops when nothing is scheduled', async () => {
    await cancelWaterReminders();
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe('useHydrationReminderReconciler', () => {
  function hookInput(
    overrides: Partial<HydrationReminderReconcilerInput> = {}
  ): HydrationReminderReconcilerInput {
    return {
      today: '2026-09-15',
      lastLoggedAt: null,
      waterMl: 0,
      waterGoalMl: 2500,
      isLoading: false,
      refetch: jest.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    useAppPreferencesStore.setState({
      waterReminderIntervalHours: 1,
      waterReminderWindowStart: '00:00',
      waterReminderWindowEnd: '23:59',
    });
  });

  it('schedules once reminders are on and data has loaded', async () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    renderHook(() => useHydrationReminderReconciler(hookInput()));
    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(1));
  });

  it('does not schedule while data is still loading', async () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    renderHook(() =>
      useHydrationReminderReconciler(hookInput({ isLoading: true }))
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('does not schedule while water reminders are off', async () => {
    renderHook(() => useHydrationReminderReconciler(hookInput()));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('turning water reminders off cancels the scheduled chain', async () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    renderHook(() => useHydrationReminderReconciler(hookInput()));
    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(1));

    act(() => {
      useAppPreferencesStore.getState().setWaterReminderEnabled(false);
    });

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('n1'));
    await waitFor(async () => expect(await storedIds()).toBeNull());
  });

  it('turning the master notifications toggle off cancels the chain too', async () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    renderHook(() => useHydrationReminderReconciler(hookInput()));
    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(1));

    act(() => {
      useAppPreferencesStore.getState().setNotificationsEnabled(false);
    });

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('n1'));
  });

  it('refetches when the app returns to the foreground', () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    const listeners: Array<(state: string) => void> = [];
    const spy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, handler) => {
        listeners.push(handler as (state: string) => void);
        return { remove: jest.fn() } as never;
      });
    const refetch = jest.fn();

    renderHook(() => useHydrationReminderReconciler(hookInput({ refetch })));
    act(() => {
      listeners.forEach((listener) => listener('active'));
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
```

(The hook tests use a `00:00`–`23:59` window with a 1-hour interval, so the real clock always produces a non-empty chain regardless of when the suite runs. `computeReminderSchedule` never returns an empty array anyway.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/hooks/useHydrationReminder.test.ts`
Expected: FAIL — `Cannot find module '../../src/hooks/useHydrationReminder'`.

- [ ] **Step 3: Implement**

Create `src/hooks/useHydrationReminder.ts`:

```ts
import { useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppLocale } from '../localization';
import {
  cancelScheduledNotification,
  scheduleWaterReminderNotifications,
} from '../services/notifications';
import { addLog } from '../services/LogService';
import {
  useAppPreferencesStore,
  type WaterReminderIntervalHours,
} from '../stores/appPreferencesStore';
import { computeReminderSchedule } from '../utils/hydrationReminder';

// Reconciliation runs in exactly one mounted place — the headless
// `HydrationReminderReconciler` on the Dashboard — and persists the scheduled
// chain so an unchanged input never reschedules. Every operation goes through
// one promise queue: a log tap and an app resume can both reconcile at once,
// and two interleaved passes would each schedule a chain.
const WATER_REMINDER_STORAGE_KEY = '@SparkyFitness/waterReminderSchedule';

interface StoredWaterReminderSchedule {
  signature: string;
  notificationIds: string[];
}

export interface WaterReminderReconcileInput {
  today: string;
  lastLoggedAt: Date | null;
  goalMetToday: boolean;
  intervalHours: WaterReminderIntervalHours;
  windowStart: string;
  windowEnd: string;
  language?: string | null;
}

let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    addLog(`Water reminder task failed: ${String(error)}`, 'ERROR');
  });
  return queue;
}

function signatureOf(input: WaterReminderReconcileInput): string {
  return JSON.stringify([
    input.today,
    input.lastLoggedAt?.getTime() ?? null,
    input.goalMetToday,
    input.intervalHours,
    input.windowStart,
    input.windowEnd,
    input.language ?? null,
  ]);
}

async function readStoredSchedule(): Promise<StoredWaterReminderSchedule | null> {
  try {
    const raw = await AsyncStorage.getItem(WATER_REMINDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredWaterReminderSchedule>;
    if (
      typeof parsed.signature === 'string' &&
      Array.isArray(parsed.notificationIds) &&
      parsed.notificationIds.every((id) => typeof id === 'string')
    ) {
      return {
        signature: parsed.signature,
        notificationIds: parsed.notificationIds,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function clearStoredSchedule(
  stored: StoredWaterReminderSchedule
): Promise<void> {
  await Promise.all(
    stored.notificationIds.map((id) => cancelScheduledNotification(id))
  );
  await AsyncStorage.removeItem(WATER_REMINDER_STORAGE_KEY);
}

/**
 * Keeps the scheduled reminder chain in step with the observed water state.
 * Idempotent for an unchanged input; any change cancels the old chain first.
 * An empty scheduling result (no permission) is not persisted, so the next
 * reconcile tries again.
 */
export function reconcileWaterReminders(
  input: WaterReminderReconcileInput,
  now: Date = new Date()
): Promise<void> {
  return enqueue(async () => {
    const signature = signatureOf(input);
    const stored = await readStoredSchedule();
    if (stored?.signature === signature) return;
    if (stored) await clearStoredSchedule(stored);

    const times = computeReminderSchedule({
      lastLoggedAt: input.lastLoggedAt,
      now,
      intervalHours: input.intervalHours,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      goalMetToday: input.goalMetToday,
    });
    const notificationIds = await scheduleWaterReminderNotifications(times);
    if (notificationIds.length === 0) return;

    await AsyncStorage.setItem(
      WATER_REMINDER_STORAGE_KEY,
      JSON.stringify({ signature, notificationIds })
    );
  });
}

/** Cancels and forgets any scheduled reminder chain. */
export function cancelWaterReminders(): Promise<void> {
  return enqueue(async () => {
    const stored = await readStoredSchedule();
    if (stored) await clearStoredSchedule(stored);
  });
}

export interface HydrationReminderReconcilerInput {
  today: string;
  lastLoggedAt: Date | null;
  waterMl: number;
  waterGoalMl: number | null;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Single-owner reconciler. Mount it once, in an always-present place. The
 * `lastLoggedAt` dependency is its millisecond value so a new Date instance
 * for the same log does not re-run the effect.
 */
export function useHydrationReminderReconciler({
  today,
  lastLoggedAt,
  waterMl,
  waterGoalMl,
  isLoading,
  refetch,
}: HydrationReminderReconcilerInput): void {
  const remindersActive = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.waterReminderEnabled
  );
  const intervalHours = useAppPreferencesStore(
    (s) => s.waterReminderIntervalHours
  );
  const windowStart = useAppPreferencesStore((s) => s.waterReminderWindowStart);
  const windowEnd = useAppPreferencesStore((s) => s.waterReminderWindowEnd);
  const appLocale = useAppLocale();

  const lastLoggedAtMs = lastLoggedAt?.getTime() ?? null;
  const goalMetToday =
    waterGoalMl !== null && waterGoalMl > 0 && waterMl >= waterGoalMl;

  useEffect(() => {
    if (!remindersActive) {
      void cancelWaterReminders();
      return;
    }
    if (isLoading) return;
    void reconcileWaterReminders({
      today,
      lastLoggedAt: lastLoggedAtMs === null ? null : new Date(lastLoggedAtMs),
      goalMetToday,
      intervalHours,
      windowStart,
      windowEnd,
      language: appLocale,
    });
  }, [
    remindersActive,
    isLoading,
    today,
    lastLoggedAtMs,
    goalMetToday,
    intervalHours,
    windowStart,
    windowEnd,
    appLocale,
  ]);

  // On resume, refetch so a drink logged elsewhere or a day rollover is seen;
  // the fresh data then reconciles through the effect above.
  useEffect(() => {
    if (!remindersActive) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => subscription.remove();
  }, [remindersActive, refetch]);
}

/** Test-only helper — drops any queued reconcile work. */
export function __resetWaterReminderStateForTests(): void {
  queue = Promise.resolve();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/hooks/useHydrationReminder.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useHydrationReminder.ts __tests__/hooks/useHydrationReminder.test.ts
git commit -m "feat(mobile): reconcile scheduled hydration reminders"
```

---

### Task 5: Headless reconciler on the Dashboard

**Files:**
- Create: `src/components/HydrationReminderReconciler.tsx`
- Modify: `src/screens/DashboardScreen.tsx`
- Test: `__tests__/components/HydrationReminderReconciler.test.tsx` (create)

**Interfaces:**
- Consumes:
  - From Task 4: `useHydrationReminderReconciler(input: HydrationReminderReconcilerInput)`.
  - From Task 2: `latestLoggedAt(entries)`.
  - Existing: `useDailySummary({ date, enabled })` (whose `summary` has `waterConsumed: number` and `waterGoal: number`), `fetchWaterIntakeLog(date)`, `waterIntakeLogQueryKey(date)`, and `getTodayDate()`.
- Produces: `export default HydrationReminderReconciler` (a `React.FC` that renders `null`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/HydrationReminderReconciler.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import HydrationReminderReconciler from '../../src/components/HydrationReminderReconciler';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { useHydrationReminderReconciler } from '../../src/hooks/useHydrationReminder';
import { fetchWaterIntakeLog } from '../../src/services/api/measurementsApi';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from '../hooks/queryTestUtils';

jest.mock('../../src/hooks/useDailySummary', () => ({
  useDailySummary: jest.fn(),
}));
jest.mock('../../src/hooks/useHydrationReminder', () => ({
  useHydrationReminderReconciler: jest.fn(),
}));
jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchWaterIntakeLog: jest.fn(),
}));

const mockUseDailySummary = useDailySummary as jest.MockedFunction<
  typeof useDailySummary
>;
const mockReconciler = useHydrationReminderReconciler as jest.MockedFunction<
  typeof useHydrationReminderReconciler
>;
const mockFetchLog = fetchWaterIntakeLog as jest.MockedFunction<
  typeof fetchWaterIntakeLog
>;

describe('HydrationReminderReconciler', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    queryClient = createTestQueryClient();
    mockUseDailySummary.mockReturnValue({
      summary: { waterConsumed: 500, waterGoal: 2500 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as never);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("feeds today's water total, goal and latest log time into the reconciler", async () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    mockFetchLog.mockResolvedValue([
      { logged_at: '2026-09-15T08:00:00.000Z' },
      { logged_at: '2026-09-15T10:30:00.000Z' },
    ] as never);

    const { toJSON } = render(<HydrationReminderReconciler />, {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(toJSON()).toBeNull();
    await waitFor(() =>
      expect(mockReconciler).toHaveBeenLastCalledWith(
        expect.objectContaining({
          waterMl: 500,
          waterGoalMl: 2500,
          isLoading: false,
          lastLoggedAt: new Date('2026-09-15T10:30:00.000Z'),
        })
      )
    );
  });

  it('skips fetching while reminders are off but still runs the reconciler so it can cancel', () => {
    render(<HydrationReminderReconciler />, {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchLog).not.toHaveBeenCalled();
    expect(mockUseDailySummary).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
    expect(mockReconciler).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/components/HydrationReminderReconciler.test.tsx`
Expected: FAIL — `Cannot find module '../../src/components/HydrationReminderReconciler'`.

- [ ] **Step 3: Implement the component**

Create `src/components/HydrationReminderReconciler.tsx`:

```tsx
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useDailySummary } from '../hooks/useDailySummary';
import { useHydrationReminderReconciler } from '../hooks/useHydrationReminder';
import { waterIntakeLogQueryKey } from '../hooks/queryKeys';
import { fetchWaterIntakeLog } from '../services/api/measurementsApi';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import { latestLoggedAt } from '../utils/hydrationReminder';

/**
 * Headless owner of hydration reminder reconciliation — renders nothing.
 *
 * Always reads today, not the Dashboard's selected date: a reminder is about
 * drinking now. Queries stay disabled while reminders are off, but the hook
 * still runs so turning them off cancels what was scheduled.
 */
const HydrationReminderReconciler: React.FC = () => {
  const remindersActive = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.waterReminderEnabled
  );
  const today = getTodayDate();

  const { summary, refetch: refetchSummary } = useDailySummary({
    date: today,
    enabled: remindersActive,
  });
  const { data: logEntries, refetch: refetchLog } = useQuery({
    queryKey: waterIntakeLogQueryKey(today),
    queryFn: () => fetchWaterIntakeLog(today),
    enabled: remindersActive,
  });

  const lastLoggedAt = useMemo(() => latestLoggedAt(logEntries), [logEntries]);

  const refetch = useCallback(() => {
    if (!remindersActive) return;
    void refetchSummary();
    void refetchLog();
  }, [remindersActive, refetchSummary, refetchLog]);

  useHydrationReminderReconciler({
    today,
    lastLoggedAt,
    waterMl: summary?.waterConsumed ?? 0,
    waterGoalMl: summary?.waterGoal ?? null,
    isLoading: summary === undefined || logEntries === undefined,
    refetch,
  });

  return null;
};

export default HydrationReminderReconciler;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/components/HydrationReminderReconciler.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount it on the Dashboard**

In `src/screens/DashboardScreen.tsx`:

(a) Directly after `import FastingGoalReconciler from '../components/FastingGoalReconciler';` add:

```tsx
import HydrationReminderReconciler from '../components/HydrationReminderReconciler';
```

(b) Replace

```tsx
        <FastingGoalReconciler />
```

with

```tsx
        <FastingGoalReconciler />
        <HydrationReminderReconciler />
```

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/HydrationReminderReconciler.tsx src/screens/DashboardScreen.tsx __tests__/components/HydrationReminderReconciler.test.tsx
git commit -m "feat(mobile): mount hydration reminder reconciler on dashboard"
```

---

### Task 6: Refresh the water log after logging a drink

**Files:**
- Modify: `src/hooks/useWaterIntakeMutation.ts`
- Test: `__tests__/hooks/useWaterIntakeMutation.test.ts`

**Interfaces:**
- Consumes: the existing `waterIntakeLogQueryKey(date)`.
- Produces: no new API. After this task, `increment`/`decrement` (which settle through `onSettled`) and `logPreset` (on success) also invalidate `waterIntakeLogQueryKey(date)`.

- [ ] **Step 1: Write the failing tests**

In `__tests__/hooks/useWaterIntakeMutation.test.ts`:

(a) Replace

```ts
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
```

with

```ts
import {
  dailySummaryQueryKey,
  waterIntakeLogQueryKey,
} from '../../src/hooks/queryKeys';
```

(b) Inside `describe('with primary container loaded', ...)`, directly after the `test('invalidates query on error', ...)` block, add:

```ts
    test("invalidates the day's water log after a drink is logged", async () => {
      mockChangeWaterIntake.mockResolvedValue({
        id: '1',
        water_ml: 750,
        entry_date: testDate,
      });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        { wrapper: createQueryWrapper(queryClient) }
      );
      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        result.current.increment();
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: waterIntakeLogQueryKey(testDate),
        });
      });
      invalidateSpy.mockRestore();
    });

    test("invalidates the day's water log after a preset is logged", async () => {
      mockChangeWaterIntake.mockResolvedValue({
        id: '1',
        water_ml: 750,
        entry_date: testDate,
      });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        { wrapper: createQueryWrapper(queryClient) }
      );
      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        result.current.logPreset(1);
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: waterIntakeLogQueryKey(testDate),
        });
      });
      invalidateSpy.mockRestore();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/hooks/useWaterIntakeMutation.test.ts`
Expected: FAIL — the two new tests time out waiting for the `waterIntakeLog` invalidation.

- [ ] **Step 3: Implement**

In `src/hooks/useWaterIntakeMutation.ts`:

(a) Replace

```ts
import { dailySummaryQueryKey, waterContainersQueryKey } from './queryKeys';
```

with

```ts
import {
  dailySummaryQueryKey,
  waterContainersQueryKey,
  waterIntakeLogQueryKey,
} from './queryKeys';
```

(b) Replace

```ts
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
    },
```

with

```ts
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
      // The itemized log backs hydration reminders and the watch's log view.
      queryClient.invalidateQueries({ queryKey: waterIntakeLogQueryKey(date) });
    },
```

(c) Replace

```ts
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: dailySummaryQueryKey(date),
      });
    },
```

with

```ts
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: dailySummaryQueryKey(date),
      });
      void queryClient.invalidateQueries({
        queryKey: waterIntakeLogQueryKey(date),
      });
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/hooks/useWaterIntakeMutation.test.ts`
Expected: PASS — the whole file.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWaterIntakeMutation.ts __tests__/hooks/useWaterIntakeMutation.test.ts
git commit -m "fix(mobile): refresh the water log after logging a drink"
```

---

### Task 7: Hydration settings

**Files:**
- Modify: `src/screens/NotificationSettingsScreen.tsx`
- Modify: `src/localization/locales/en/translation.json`
- Test: `__tests__/screens/NotificationSettingsScreen.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `WATER_REMINDER_INTERVAL_OPTIONS`, `WaterReminderIntervalHours`, the four fields, and their setters.
  - From Task 2: `isValidReminderWindow(start, end)`.
  - Existing: `requestNotificationPermission()`, `SegmentedControl<T>({ segments, activeKey, onSelect })`, `TimeSheet` + `TimeSheetRef { present; dismiss }` (props `value`, `onSelectTime`), `usePreferences()` → `{ preferences }`, and `formatTimeLabel(time, timeFormat)`.
- Produces: UI only.

- [ ] **Step 1: Write the failing tests**

In `__tests__/screens/NotificationSettingsScreen.test.tsx`:

(a) Replace

```ts
import { fireEvent, render, waitFor } from '@testing-library/react-native';
```

with

```ts
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
```

(b) Directly after the `jest.mock('react-native-safe-area-context', ...)` block, add:

```ts
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { time_format: 'HH:mm' } }),
}));

type MockTimeSheetProps = {
  value: string;
  onSelectTime: (time: string) => void;
};
const mockTimeSheetRenders: MockTimeSheetProps[] = [];
jest.mock('../../src/components/TimeSheet', () => {
  const ReactModule = require('react');
  const MockTimeSheet = ReactModule.forwardRef(
    (props: MockTimeSheetProps, ref: unknown) => {
      ReactModule.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      mockTimeSheetRenders.push(props);
      return null;
    }
  );
  MockTimeSheet.displayName = 'MockTimeSheet';
  return { __esModule: true, default: MockTimeSheet };
});

/** The most recently rendered time sheet currently showing `value`. */
function latestTimeSheet(value: string): MockTimeSheetProps {
  const matches = mockTimeSheetRenders.filter((p) => p.value === value);
  const match = matches[matches.length - 1];
  if (!match) throw new Error(`No time sheet rendered with value ${value}`);
  return match;
}
```

(c) In the top-level `beforeEach`, after `mockRequestPermission.mockResolvedValue('granted');`, add:

```ts
    mockTimeSheetRenders.length = 0;
```

(d) Directly before the final `it('provides contextual accessibility labels for notification switches', ...)` test, add:

```ts
  describe('water reminders', () => {
    // Found by label rather than index so the Hydration group's position
    // cannot shift it, and via role so the row's own label cannot collide.
    function waterSwitch(
      getAllByRole: ReturnType<typeof renderScreen>['getAllByRole']
    ) {
      const match = getAllByRole('switch').find(
        (element) => element.props.accessibilityLabel === 'Water Reminders'
      );
      if (!match) throw new Error('Water Reminders switch not rendered');
      return match;
    }

    it('hides the reminder options until water reminders are on', () => {
      const { queryByText } = renderScreen();
      expect(queryByText('Remind After')).toBeNull();
      expect(queryByText('Start Time')).toBeNull();
    });

    it('turns reminders on only after permission is granted', async () => {
      const { getAllByRole } = renderScreen();

      fireEvent(waterSwitch(getAllByRole), 'valueChange', true);

      await waitFor(() => {
        expect(useAppPreferencesStore.getState().waterReminderEnabled).toBe(
          true
        );
      });
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });

    it('leaves reminders off when permission is not granted', async () => {
      mockRequestPermission.mockResolvedValue('denied');
      const { getAllByRole } = renderScreen();

      fireEvent(waterSwitch(getAllByRole), 'valueChange', true);

      await waitFor(() => {
        expect(mockRequestPermission).toHaveBeenCalled();
      });
      expect(useAppPreferencesStore.getState().waterReminderEnabled).toBe(
        false
      );
    });

    it('turns reminders off without requesting permission', async () => {
      useAppPreferencesStore.setState({ waterReminderEnabled: true });
      const { getAllByRole } = renderScreen();

      fireEvent(waterSwitch(getAllByRole), 'valueChange', false);

      await waitFor(() => {
        expect(useAppPreferencesStore.getState().waterReminderEnabled).toBe(
          false
        );
      });
      expect(mockRequestPermission).not.toHaveBeenCalled();
    });

    it('selects the reminder interval', () => {
      useAppPreferencesStore.setState({ waterReminderEnabled: true });
      const { getByText } = renderScreen();

      fireEvent.press(getByText('3h'));

      expect(
        useAppPreferencesStore.getState().waterReminderIntervalHours
      ).toBe(3);
    });

    it('saves a start time that stays before the end time', () => {
      useAppPreferencesStore.setState({ waterReminderEnabled: true });
      renderScreen();

      act(() => {
        latestTimeSheet('08:00').onSelectTime('07:00');
      });

      const state = useAppPreferencesStore.getState();
      expect(state.waterReminderWindowStart).toBe('07:00');
      expect(state.waterReminderWindowEnd).toBe('22:00');
    });

    it('rejects an end time that is not after the start time', () => {
      useAppPreferencesStore.setState({ waterReminderEnabled: true });
      renderScreen();

      act(() => {
        latestTimeSheet('22:00').onSelectTime('08:00');
      });

      expect(useAppPreferencesStore.getState().waterReminderWindowEnd).toBe(
        '22:00'
      );
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'End time must be after start time.',
        })
      );
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/screens/NotificationSettingsScreen.test.tsx`
Expected: FAIL — `Water Reminders switch not rendered`, `No time sheet rendered with value 08:00`, and no `3h` text. The existing tests still pass.

- [ ] **Step 3: Add the English copy**

In `src/localization/locales/en/translation.json`, replace

```json
    "hideMedicationNamesSubtitle": "Show a generic reminder instead of the medication name and dose.",
```

with

```json
    "hideMedicationNamesSubtitle": "Show a generic reminder instead of the medication name and dose.",
    "hydration": "Hydration",
    "waterReminders": "Water Reminders",
    "waterRemindersSubtitle": "Remind you to drink when you haven't logged water in a while.",
    "waterReminderInterval": "Remind After",
    "waterReminderIntervalOption": "{{hours}}h",
    "waterReminderStart": "Start Time",
    "waterReminderStartAccessibility": "Start time, {{time}}",
    "waterReminderEnd": "End Time",
    "waterReminderEndAccessibility": "End time, {{time}}",
    "waterReminderInvalidWindow": "End time must be after start time.",
```

- [ ] **Step 4: Implement**

In `src/screens/NotificationSettingsScreen.tsx`:

(a) Replace the import block from `import React, { useCallback, useRef } from 'react';` down to and including `import type { RootStackScreenProps } from '../types/navigation';` with:

```tsx
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import NotificationPermissionBanner, {
  type NotificationPermissionBannerHandle,
} from '../components/NotificationPermissionBanner';
import SegmentedControl from '../components/SegmentedControl';
import TimeSheet, { type TimeSheetRef } from '../components/TimeSheet';
import Switch from '../components/ui/Switch';
import {
  maybePromptForExactAlarmPermission,
  requestNotificationPermission,
  setNotificationsEnabled,
  setRestTimerNotificationsEnabled,
} from '../services/notifications';
import {
  WATER_REMINDER_INTERVAL_OPTIONS,
  useAppPreferencesStore,
  type WaterReminderIntervalHours,
} from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { formatTimeLabel } from '../utils/entryTimeDisplay';
import { isValidReminderWindow } from '../utils/hydrationReminder';
import type { RootStackScreenProps } from '../types/navigation';

type IntervalKey = `${WaterReminderIntervalHours}`;
```

(b) Directly after

```tsx
  const setMedicationReminderHideNames = useAppPreferencesStore(
    (s) => s.setMedicationReminderHideNames
  );
```

add:

```tsx
  const waterReminderEnabled = useAppPreferencesStore(
    (s) => s.waterReminderEnabled
  );
  const setWaterReminderEnabled = useAppPreferencesStore(
    (s) => s.setWaterReminderEnabled
  );
  const waterReminderIntervalHours = useAppPreferencesStore(
    (s) => s.waterReminderIntervalHours
  );
  const setWaterReminderIntervalHours = useAppPreferencesStore(
    (s) => s.setWaterReminderIntervalHours
  );
  const waterReminderWindowStart = useAppPreferencesStore(
    (s) => s.waterReminderWindowStart
  );
  const waterReminderWindowEnd = useAppPreferencesStore(
    (s) => s.waterReminderWindowEnd
  );
  const setWaterReminderWindow = useAppPreferencesStore(
    (s) => s.setWaterReminderWindow
  );
  const { preferences } = usePreferences();
  const startTimeSheetRef = useRef<TimeSheetRef>(null);
  const endTimeSheetRef = useRef<TimeSheetRef>(null);
```

(c) Directly after the `handleMedicationRemindersToggle` `useCallback` (ending `[setMedicationRemindersEnabled]\n  );`), add:

```tsx
  const handleWaterRemindersToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        setWaterReminderEnabled(false);
        return;
      }
      const status = await requestNotificationPermission();
      bannerRef.current?.refresh();
      // Same rule as medication reminders: never show "on" while the OS would
      // silently drop every reminder.
      if (status === 'granted') setWaterReminderEnabled(true);
    },
    [setWaterReminderEnabled]
  );

  const intervalSegments = useMemo(
    () =>
      WATER_REMINDER_INTERVAL_OPTIONS.map((hours) => ({
        key: String(hours) as IntervalKey,
        label: t('notificationSettings.waterReminderIntervalOption', {
          defaultValue: '{{hours}}h',
          hours,
        }),
      })),
    [t]
  );

  const handleIntervalSelect = useCallback(
    (key: IntervalKey) => {
      setWaterReminderIntervalHours(Number(key) as WaterReminderIntervalHours);
    },
    [setWaterReminderIntervalHours]
  );

  const showInvalidWindowToast = useCallback(() => {
    Toast.show({
      type: 'error',
      text1: t('notificationSettings.waterReminderInvalidWindow', {
        defaultValue: 'End time must be after start time.',
      }),
    });
  }, [t]);

  const handleStartTimeSelect = useCallback(
    (time: string) => {
      if (!isValidReminderWindow(time, waterReminderWindowEnd)) {
        showInvalidWindowToast();
        return;
      }
      setWaterReminderWindow(time, waterReminderWindowEnd);
    },
    [waterReminderWindowEnd, setWaterReminderWindow, showInvalidWindowToast]
  );

  const handleEndTimeSelect = useCallback(
    (time: string) => {
      if (!isValidReminderWindow(waterReminderWindowStart, time)) {
        showInvalidWindowToast();
        return;
      }
      setWaterReminderWindow(waterReminderWindowStart, time);
    },
    [waterReminderWindowStart, setWaterReminderWindow, showInvalidWindowToast]
  );

  const startTimeLabel =
    formatTimeLabel(waterReminderWindowStart, preferences?.time_format) ??
    waterReminderWindowStart;
  const endTimeLabel =
    formatTimeLabel(waterReminderWindowEnd, preferences?.time_format) ??
    waterReminderWindowEnd;
```

(d) Replace the tail of the render, from the end of the Medications group through the end of the component's JSX:

```tsx
            )}
          </SettingsRowGroup>
        )}
      </ScrollView>
    </View>
  );
};
```

with:

```tsx
            )}
          </SettingsRowGroup>
        )}

        {notificationsEnabled && (
          <SettingsRowGroup
            title={t('notificationSettings.hydration', {
              defaultValue: 'Hydration',
            })}
          >
            <SettingsRow
              title={t('notificationSettings.waterReminders', {
                defaultValue: 'Water Reminders',
              })}
              subtitle={t('notificationSettings.waterRemindersSubtitle', {
                defaultValue:
                  "Remind you to drink when you haven't logged water in a while.",
              })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t('notificationSettings.waterReminders', {
                    defaultValue: 'Water Reminders',
                  })}
                  value={waterReminderEnabled}
                  onValueChange={handleWaterRemindersToggle}
                />
              }
            />
            {waterReminderEnabled && (
              <SettingsRow
                title={t('notificationSettings.waterReminderInterval', {
                  defaultValue: 'Remind After',
                })}
                subtitle={
                  <View className="mt-2">
                    <SegmentedControl
                      segments={intervalSegments}
                      activeKey={String(waterReminderIntervalHours) as IntervalKey}
                      onSelect={handleIntervalSelect}
                    />
                  </View>
                }
              />
            )}
            {waterReminderEnabled && (
              <SettingsRow
                title={t('notificationSettings.waterReminderStart', {
                  defaultValue: 'Start Time',
                })}
                onPress={() => startTimeSheetRef.current?.present()}
                accessibilityLabel={t(
                  'notificationSettings.waterReminderStartAccessibility',
                  { defaultValue: 'Start time, {{time}}', time: startTimeLabel }
                )}
                rightAccessory={
                  <Text className="text-sm text-text-secondary">
                    {startTimeLabel}
                  </Text>
                }
              />
            )}
            {waterReminderEnabled && (
              <SettingsRow
                title={t('notificationSettings.waterReminderEnd', {
                  defaultValue: 'End Time',
                })}
                onPress={() => endTimeSheetRef.current?.present()}
                accessibilityLabel={t(
                  'notificationSettings.waterReminderEndAccessibility',
                  { defaultValue: 'End time, {{time}}', time: endTimeLabel }
                )}
                rightAccessory={
                  <Text className="text-sm text-text-secondary">
                    {endTimeLabel}
                  </Text>
                }
              />
            )}
          </SettingsRowGroup>
        )}
      </ScrollView>

      <TimeSheet
        ref={startTimeSheetRef}
        value={waterReminderWindowStart}
        onSelectTime={handleStartTimeSelect}
      />
      <TimeSheet
        ref={endTimeSheetRef}
        value={waterReminderWindowEnd}
        onSelectTime={handleEndTimeSelect}
      />
    </View>
  );
};
```

The Hydration group sits **after** Medications on purpose. The existing tests find switches by index (`MEDICATION_SWITCH_INDEX = 3`), and adding rows after them leaves those indices unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec jest --watchman=false --runInBand __tests__/screens/NotificationSettingsScreen.test.tsx`
Expected: PASS — the whole file (existing tests plus the 7 new ones).

- [ ] **Step 6: Typecheck and audit copy**

Run: `pnpm run typecheck && pnpm run i18n:audit`
Expected: both exit 0. If typecheck rejects `preferences?.time_format` for `formatTimeLabel`, check what `TimeSheet.tsx` passes to `is12HourTimeFormat` and pass the same value; don't cast through `any`.

- [ ] **Step 7: Commit**

```bash
git add src/screens/NotificationSettingsScreen.tsx src/localization/locales/en/translation.json __tests__/screens/NotificationSettingsScreen.test.tsx
git commit -m "feat(mobile): add hydration reminder settings"
```

---

### Task 8: Documentation and full validation

**Files:**
- Modify: `SparkyFitnessMobile/AGENTS.md`
- Modify: `docs/superpowers/specs/2026-09-15-hydration-reminders-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: docs only.

- [ ] **Step 1: Update the mobile package guide**

In `SparkyFitnessMobile/AGENTS.md`:

(a) Replace `_Last updated: 2026-09-13_` with `_Last updated: 2026-09-15_`.

(b) In the "React Query And Local State" app-preferences bullet, replace

```
the default rest period (`defaultRestSec`, edited in `WorkoutSettingsScreen`),
```

with

```
the default rest period (`defaultRestSec`, edited in `WorkoutSettingsScreen`), hydration reminders (`waterReminderEnabled`, `waterReminderIntervalHours`, `waterReminderWindowStart` / `waterReminderWindowEnd`, edited in `NotificationSettingsScreen`),
```

(c) In "Dashboard, Diary, Measurements, And Nutrients", directly after the bullet that starts ``- `DashboardScreen` drives hydration quick-add``, add:

```markdown
- Hydration reminders are local notifications owned by the headless `HydrationReminderReconciler` on `DashboardScreen` (always today, never `selectedDate`). `computeReminderSchedule` (`utils/hydrationReminder.ts`) builds a chain of up to 12 reminder times from the day's latest water `logged_at`, each inside the user's `[start, end)` window; `reconcileWaterReminders` (`hooks/useHydrationReminder.ts`) persists the scheduled ids under a signature and cancels/reschedules only when that signature changes. A chain rather than one ping because a scheduled notification cannot reschedule itself while the app is closed. Any mutation that logs water must invalidate `waterIntakeLogQueryKey(date)` or the reconciler keeps the old anchor. Paired watches receive these through OS notification mirroring; there is no watch-side code.
```

- [ ] **Step 2: Record the amendments in the spec**

In `docs/superpowers/specs/2026-09-15-hydration-reminders-design.md`:

(a) Replace `- **Status:** Draft, pending review.` with `- **Status:** Approved; amended during planning (see "Amendments" at the end).`

(b) Append to the end of the file:

```markdown

## Amendments (made while planning, 2026-09-15)

These supersede the matching parts of Components §3–§5 above.

1. **A chain, not one notification.** `computeReminderSchedule(...)` returns
   up to 12 upcoming reminder times (each one interval after the previous,
   moved into `[windowStart, windowEnd)` — a time before a day's start moves
   to that start, a time at/after the end rolls to the next day's start). A
   single scheduled notification cannot reschedule itself while the app is
   closed, so one ping would have been the last until the app was opened.
   It replaces the single-result `computeNextReminderTime(...)`.
2. **Goal met → chain starts at tomorrow's window start**, instead of
   cancelling everything and losing tomorrow's reminders for anyone who does
   not open the app.
3. **No "no goal configured" path.** `buildDailySummary` falls back to a
   2500 ml goal and the Dashboard shows that as the user's goal; reminders
   use the same value.
4. **Overdue reminders** (the next time is already past) fire one minute
   from now.
5. **Toggle-off cancellation** is done by the reconciler effect when
   `notificationsEnabled && waterReminderEnabled` turns false — the fasting
   pattern — rather than a new setter in `notifications.ts`, which would
   have created a hooks ↔ service import cycle.
6. **Settings row labels** are "Water Reminders", "Remind After", "Start
   Time", and "End Time"; the notification permission is never prompted from
   the background reconcile, only from the settings toggle.
```

- [ ] **Step 3: Run the related suites together**

Run:

```bash
pnpm exec jest --watchman=false --runInBand __tests__/stores/appPreferencesStore.waterReminder.test.ts __tests__/utils/hydrationReminder.test.ts __tests__/services/notifications.test.ts __tests__/hooks/useHydrationReminder.test.ts __tests__/components/HydrationReminderReconciler.test.tsx __tests__/hooks/useWaterIntakeMutation.test.ts __tests__/screens/NotificationSettingsScreen.test.tsx __tests__/hooks/useFasting.reconcile.test.ts __tests__/components/FastingGoalReconciler.test.tsx
```

Expected: all PASS.

- [ ] **Step 4: Run the full mobile suite**

Run: `pnpm exec jest --watchman=false --runInBand`
Expected: all PASS. The preference store is a shared global, so a failure in an unrelated file usually means a test that snapshots the full preference state or `PREFERENCE_DEFAULTS`. Update that test's expected object to include the four new fields; don't change the store.

- [ ] **Step 5: Run the CI gate**

Run: `pnpm run validate`
Expected: exits 0 (i18n generate check, typecheck, lint with zero warnings, i18n audit, Knip, native locales, Prettier). If only Prettier fails, run `pnpm exec prettier --write` on the files this plan touched, and nothing else, then re-run.

- [ ] **Step 6: Commit** (from the repo root)

```bash
git add SparkyFitnessMobile/AGENTS.md docs/superpowers/specs/2026-09-15-hydration-reminders-design.md
git commit -m "docs(mobile): document hydration reminders"
```

If Step 5 needed formatting fixes, stage those source/test files by explicit path in this same commit.

- [ ] **Step 7: Manual check on a device** (UI and scheduling cannot be proven by Jest)

1. Build a dev client (`pnpm run ios` or `pnpm run android`), then open Settings → Notifications and turn on Water Reminders. Grant permission when prompted.
2. Choose `1h`. Set Start to a minute or two before now, and End to later today.
3. Background the app. Confirm a "Time to hydrate" notification arrives about 1 hour after start (or after your last log). On iOS with a paired Apple Watch, lock the phone first and confirm the notification mirrors to the watch.
4. Log a drink, background the app, and confirm the pending reminder moves out by one interval.
5. Set End earlier than Start and confirm the error toast appears and the value is not saved.
