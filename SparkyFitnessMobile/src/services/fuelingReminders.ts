import AsyncStorage from '@react-native-async-storage/async-storage';

import { addLog } from './LogService';
import {
  cancelScheduledNotification,
  scheduleFuelingReminderNotifications,
} from './notifications';
import { fuelingReminderTimes } from '../utils/fuelingReminder';

// One fueling session at a time: starting a plan replaces the previous one.
// Every operation goes through one promise queue so a double tap on Start
// cannot interleave two passes and schedule two chains.
const FUELING_SESSION_STORAGE_KEY = '@SparkyFitness/fuelingSession';

export interface FuelingSession {
  startAtMs: number;
  portionGrams: number;
  productName: string;
  /** How many reminders were scheduled. */
  reminderCount: number;
  notificationIds: string[];
}

export interface StartFuelingSessionInput {
  startAt: Date;
  offsetsMin: readonly number[];
  portionGrams: number;
  productName: string;
}

export type StartFuelingSessionResult =
  | { status: 'scheduled'; reminderCount: number }
  /** No reminder is left in the future for this plan. */
  | { status: 'nothing_to_schedule' }
  /** Notifications are off or the OS permission is missing. */
  | { status: 'not_permitted' };

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch((error: unknown) => {
    addLog(`Fueling reminder task failed: ${String(error)}`, 'ERROR');
  });
  return run;
}

async function readSession(): Promise<FuelingSession | null> {
  try {
    const raw = await AsyncStorage.getItem(FUELING_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FuelingSession>;
    if (
      typeof parsed.startAtMs === 'number' &&
      typeof parsed.portionGrams === 'number' &&
      typeof parsed.productName === 'string' &&
      typeof parsed.reminderCount === 'number' &&
      Array.isArray(parsed.notificationIds) &&
      parsed.notificationIds.every((id) => typeof id === 'string')
    ) {
      return {
        startAtMs: parsed.startAtMs,
        portionGrams: parsed.portionGrams,
        productName: parsed.productName,
        reminderCount: parsed.reminderCount,
        notificationIds: parsed.notificationIds,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function clearSession(session: FuelingSession): Promise<void> {
  await Promise.all(
    session.notificationIds.map((id) => cancelScheduledNotification(id))
  );
  await AsyncStorage.removeItem(FUELING_SESSION_STORAGE_KEY);
}

/** The scheduled session, or null when none is running. */
export function getFuelingSession(): Promise<FuelingSession | null> {
  return enqueue(readSession);
}

/** Cancels and forgets the scheduled session. */
export function cancelFuelingSession(): Promise<void> {
  return enqueue(async () => {
    const stored = await readSession();
    if (stored) await clearSession(stored);
  });
}

/**
 * Replaces any running session with reminders for this plan. The previous
 * session is only cancelled once there is something to put in its place, so a
 * failed attempt never leaves the runner with no reminders at all.
 */
export function startFuelingSession(
  input: StartFuelingSessionInput,
  now: Date = new Date()
): Promise<StartFuelingSessionResult> {
  return enqueue(async () => {
    const times = fuelingReminderTimes({
      startAt: input.startAt,
      offsetsMin: input.offsetsMin,
      now,
    });
    if (times.length === 0) return { status: 'nothing_to_schedule' };

    const stored = await readSession();
    if (stored) await clearSession(stored);

    const notificationIds = await scheduleFuelingReminderNotifications(
      times,
      input.portionGrams,
      input.productName
    );
    if (notificationIds.length === 0) return { status: 'not_permitted' };

    const session: FuelingSession = {
      startAtMs: input.startAt.getTime(),
      portionGrams: input.portionGrams,
      productName: input.productName,
      reminderCount: notificationIds.length,
      notificationIds,
    };
    try {
      await AsyncStorage.setItem(
        FUELING_SESSION_STORAGE_KEY,
        JSON.stringify(session)
      );
    } catch (error) {
      // Ids that were not persisted can never be cancelled later, so a live
      // chain nothing can reach is worse than none.
      await Promise.all(
        notificationIds.map((id) => cancelScheduledNotification(id))
      );
      throw error;
    }
    return { status: 'scheduled', reminderCount: notificationIds.length };
  });
}

export function __resetFuelingReminderStateForTests(): void {
  queue = Promise.resolve();
}
