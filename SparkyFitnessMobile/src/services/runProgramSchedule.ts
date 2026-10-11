import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelScheduledNotification } from './notifications';

/**
 * When a training program's workout shows up in the Diary, kept on this phone:
 * the weekdays the person plans to run (none means any day) and the first day
 * the workout is offered (none means from today). The program itself, and the
 * place in it, live on the server.
 */
// The key the weekly run reminders used; the days carry over.
const KEY = '@SparkyFitness/runReminders';

export interface RunSchedule {
  /** 0 = Sunday to 6 = Saturday; empty means every day. */
  days: number[];
  /** First day (YYYY-MM-DD) the Diary offers the workout, or null for today. */
  startDay: string | null;
}

export const DEFAULT_RUN_SCHEDULE: RunSchedule = { days: [], startDay: null };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const listeners = new Set<() => void>();

async function read(): Promise<RunSchedule> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw
      ? (JSON.parse(raw) as {
          days?: unknown;
          startDay?: unknown;
          ids?: unknown;
        })
      : null;
    if (!parsed) return DEFAULT_RUN_SCHEDULE;
    // Reminders from an earlier build are no longer offered: stop them.
    if (Array.isArray(parsed.ids) && parsed.ids.length > 0) {
      await Promise.all(
        parsed.ids.map((id) =>
          typeof id === 'string' ? cancelScheduledNotification(id) : undefined
        )
      );
      await AsyncStorage.setItem(
        KEY,
        JSON.stringify({ days: parsed.days, startDay: parsed.startDay ?? null })
      );
    }
    return {
      days: Array.isArray(parsed.days)
        ? [
            ...new Set(
              parsed.days.filter(
                (d): d is number => Number.isInteger(d) && d >= 0 && d <= 6
              )
            ),
          ].sort()
        : [],
      startDay:
        typeof parsed.startDay === 'string' && DAY_PATTERN.test(parsed.startDay)
          ? parsed.startDay
          : null,
    };
  } catch {
    return DEFAULT_RUN_SCHEDULE;
  }
}

export function getRunSchedule(): Promise<RunSchedule> {
  return read();
}

/** Saves part of the schedule. */
export async function setRunSchedule(
  change: Partial<RunSchedule>
): Promise<void> {
  const current = await read();
  const next: RunSchedule = {
    days: change.days ?? current.days,
    startDay:
      change.startDay === undefined ? current.startDay : change.startDay,
  };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // The choice just won't be remembered.
  }
  listeners.forEach((listener) => listener());
}

export function useRunSchedule(): RunSchedule {
  const [state, setState] = useState<RunSchedule>(DEFAULT_RUN_SCHEDULE);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getRunSchedule().then((value) => {
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
