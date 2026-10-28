import AsyncStorage from '@react-native-async-storage/async-storage';

import { addLog } from './LogService';
import {
  cancelScheduledNotification,
  scheduleDrinkReminderNotifications,
  scheduleFuelingReminderNotifications,
} from './notifications';
import { fuelingReminderTimes } from '../utils/fuelingReminder';
import type { FuelingFoodRef } from '../utils/fuelingLog';

// One fueling session at a time: starting a plan replaces the previous one.
// Every operation goes through one promise queue so a double tap on Start
// cannot interleave two passes and schedule two chains.
const FUELING_SESSION_STORAGE_KEY = '@SparkyFitness/fuelingSession';

export interface FuelingSession {
  startAtMs: number;
  portionGrams: number;
  productName: string;
  /** The saved food a portion stands for, when one was chosen. */
  food: FuelingFoodRef | null;
  /** How many carbohydrate reminders were scheduled. */
  reminderCount: number;
  /** The separate drink reminders, when they were switched on. */
  drink: { reminderCount: number; mlPerDrink: number } | null;
  /** Every scheduled notification, carbohydrate and drink, so Stop reaches all. */
  notificationIds: string[];
}

export interface StartFuelingSessionInput {
  startAt: Date;
  offsetsMin: readonly number[];
  portionGrams: number;
  productName: string;
  food?: FuelingFoodRef | null;
  /** Drink reminders to run beside the carbohydrate ones. */
  drink?: { offsetsMin: readonly number[]; mlPerDrink: number } | null;
}

export type StartFuelingSessionResult =
  | { status: 'scheduled'; reminderCount: number; drinkCount: number }
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

function isFoodRef(value: unknown): value is FuelingFoodRef {
  if (!value || typeof value !== 'object') return false;
  const food = value as Partial<FuelingFoodRef>;
  return (
    typeof food.foodId === 'string' &&
    typeof food.variantId === 'string' &&
    typeof food.servingSize === 'number' &&
    typeof food.servingUnit === 'string'
  );
}

function isDrinkSession(value: unknown): value is FuelingSession['drink'] {
  if (!value || typeof value !== 'object') return false;
  const drink = value as Partial<NonNullable<FuelingSession['drink']>>;
  return (
    typeof drink.reminderCount === 'number' &&
    typeof drink.mlPerDrink === 'number'
  );
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
        food: isFoodRef(parsed.food) ? parsed.food : null,
        drink: isDrinkSession(parsed.drink) ? parsed.drink : null,
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
    const drinkTimes = input.drink
      ? fuelingReminderTimes({
          startAt: input.startAt,
          offsetsMin: input.drink.offsetsMin,
          now,
        })
      : [];
    if (times.length === 0 && drinkTimes.length === 0) {
      return { status: 'nothing_to_schedule' };
    }

    const stored = await readSession();
    if (stored) await clearSession(stored);

    const carbIds =
      times.length > 0
        ? await scheduleFuelingReminderNotifications(
            times,
            input.portionGrams,
            input.productName,
            input.food ?? null
          )
        : [];
    if (times.length > 0 && carbIds.length === 0) {
      return { status: 'not_permitted' };
    }
    const drinkIds =
      input.drink && drinkTimes.length > 0
        ? await scheduleDrinkReminderNotifications(
            drinkTimes,
            input.drink.mlPerDrink
          )
        : [];
    if (drinkTimes.length > 0 && drinkIds.length === 0) {
      await Promise.all(carbIds.map((id) => cancelScheduledNotification(id)));
      return { status: 'not_permitted' };
    }
    const notificationIds = [...carbIds, ...drinkIds];

    const session: FuelingSession = {
      startAtMs: input.startAt.getTime(),
      portionGrams: input.portionGrams,
      productName: input.productName,
      food: input.food ?? null,
      reminderCount: carbIds.length,
      drink:
        input.drink && drinkIds.length > 0
          ? {
              reminderCount: drinkIds.length,
              mlPerDrink: input.drink.mlPerDrink,
            }
          : null,
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
    return {
      status: 'scheduled',
      reminderCount: carbIds.length,
      drinkCount: drinkIds.length,
    };
  });
}

export function __resetFuelingReminderStateForTests(): void {
  queue = Promise.resolve();
}
