import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelScheduledNotification,
  scheduleRunReminderNotifications,
} from './notifications';
import { queryClient } from '../hooks/queryClient';
import { runProgramQueryKey } from '../hooks/queryKeys';
import { getProgramStatus } from './runProgramService';

/**
 * Weekly "time for your run" reminders for a run program: the weekdays and
 * hour the person picked, kept on this phone. The reminders repeat weekly and
 * say the same thing every time, so they only need rescheduling when the
 * choice changes or the program starts, ends or is left.
 */
const KEY = '@SparkyFitness/runReminders';

export interface RunReminders {
  /** 0 = Sunday to 6 = Saturday. */
  days: number[];
  /** Local hour, 0 to 23. */
  hour: number;
}

export const DEFAULT_RUN_REMINDERS: RunReminders = { days: [], hour: 7 };

interface Stored extends RunReminders {
  ids: string[];
}

const listeners = new Set<() => void>();
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(task: () => Promise<T>): Promise<T> => {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
};

async function read(): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (parsed && Array.isArray(parsed.days) && Number.isFinite(parsed.hour)) {
      return {
        days: [...new Set(parsed.days.filter((d) => d >= 0 && d <= 6))].sort(),
        hour: Math.min(23, Math.max(0, Math.round(parsed.hour as number))),
        ids: Array.isArray(parsed.ids) ? parsed.ids : [],
      };
    }
  } catch {
    // Falls through to the default.
  }
  return { ...DEFAULT_RUN_REMINDERS, ids: [] };
}

export function getRunReminders(): Promise<RunReminders> {
  return read().then(({ days, hour }) => ({ days, hour }));
}

/**
 * Makes the scheduled notifications match the saved choice and the program:
 * none unless a program is under way and at least one day is chosen.
 */
export function reconcileRunReminders(): Promise<void> {
  return serial(async () => {
    const stored = await read();
    // Ask first: with no answer (offline) the reminders already scheduled stay.
    let status;
    try {
      status = await getProgramStatus();
    } catch {
      return;
    }
    await Promise.all(stored.ids.map((id) => cancelScheduledNotification(id)));
    const wanted = !!status && !status.finished && stored.days.length > 0;
    const ids = wanted
      ? await scheduleRunReminderNotifications(stored.days, stored.hour)
      : [];
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...stored, ids }));
    listeners.forEach((listener) => listener());
  });
}

const syncedToolCalls = new Set<string>();

/**
 * The assistant may have changed the program: drop the cached copy and make
 * the reminders match the new place, once per tool call.
 */
export function syncAfterAssistantChange(toolCallId: string): void {
  if (syncedToolCalls.has(toolCallId)) return;
  syncedToolCalls.add(toolCallId);
  void queryClient.invalidateQueries({ queryKey: runProgramQueryKey });
  void reconcileRunReminders().catch(() => {});
}

/** Saves the choice and reschedules. */
export function setRunReminders(choice: RunReminders): Promise<void> {
  return serial(async () => {
    const stored = await read();
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...stored, days: choice.days, hour: choice.hour })
    );
  }).then(() => reconcileRunReminders());
}

export function useRunReminders(): RunReminders {
  const [state, setState] = useState<RunReminders>(DEFAULT_RUN_REMINDERS);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getRunReminders().then((value) => {
        if (active) setState(value);
      });
    };
    refresh();
    listeners.add(refresh);
    return () => {
      active = false;
      listeners.delete(refresh);
    };
  }, []);
  return state;
}
