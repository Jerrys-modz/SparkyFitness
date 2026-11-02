import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelScheduledNotification } from './notifications';
import { addLog } from './LogService';

interface StoredChain {
  signature: string;
  notificationIds: string[];
}

export interface ReminderChain {
  /**
   * Makes `schedule`'s notifications the pending set for `signature`. A
   * repeat call with the same signature does nothing; a changed signature
   * cancels the previous set first. An empty result (no permission, nothing
   * due) is not persisted, so the next call tries again.
   */
  reconcile: (
    signature: string,
    schedule: () => Promise<string[]>
  ) => Promise<void>;
  /** Cancels and forgets whatever is pending. */
  cancel: () => Promise<void>;
  /** Test-only: drops queued work. */
  resetForTests: () => void;
}

/**
 * A persisted, serialized set of scheduled local notifications. Every
 * operation goes through one promise queue: a log tap and an app resume can
 * both reconcile at once, and two interleaved passes would each schedule a
 * set. The ids are persisted so a toggle-off can cancel them later.
 */
export function createReminderChain(
  storageKey: string,
  label: string
): ReminderChain {
  let queue: Promise<void> = Promise.resolve();

  const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(task).catch((error: unknown) => {
      addLog(`${label} task failed: ${String(error)}`, 'ERROR');
    });
    return queue;
  };

  const read = async (): Promise<StoredChain | null> => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredChain>;
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
  };

  const clear = async (stored: StoredChain): Promise<void> => {
    await Promise.all(
      stored.notificationIds.map((id) => cancelScheduledNotification(id))
    );
    await AsyncStorage.removeItem(storageKey);
  };

  return {
    reconcile: (signature, schedule) =>
      enqueue(async () => {
        const stored = await read();
        if (stored?.signature === signature) return;
        if (stored) await clear(stored);

        const notificationIds = await schedule();
        if (notificationIds.length === 0) return;

        try {
          await AsyncStorage.setItem(
            storageKey,
            JSON.stringify({ signature, notificationIds })
          );
        } catch (error) {
          // An unpersisted set could never be cancelled, including by the
          // toggle-off path, so cancel it here and let the queue log it.
          await Promise.all(
            notificationIds.map((id) => cancelScheduledNotification(id))
          );
          throw error;
        }
      }),
    cancel: () =>
      enqueue(async () => {
        const stored = await read();
        if (stored) await clear(stored);
      }),
    resetForTests: () => {
      queue = Promise.resolve();
    },
  };
}
