import * as Notifications from 'expo-notifications';

import { addLog } from './LogService';

/** Cancels each scheduled notification id, ignoring ones already gone. */
export async function cancelNotificationIds(
  ids: Iterable<string>
): Promise<void> {
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // already cancelled or never scheduled
      }
    })
  );
}

/**
 * Cancels every scheduled reminder of one kind, however it was identified: the
 * ids this build uses plus any pending notification whose `data.kind` matches
 * (ids from an older build). Listing failures are logged, and the known ids are
 * still cancelled.
 */
export async function cancelRemindersOfKind(
  kind: string,
  knownIds: Iterable<string>,
  logName: string
): Promise<void> {
  const ids = new Set<string>(knownIds);
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.content.data?.kind === kind) ids.add(n.identifier);
    }
  } catch (err) {
    addLog(`${logName} failed to list: ${(err as Error).message}`, 'ERROR');
  }
  await cancelNotificationIds(ids);
}

/**
 * Returns a function that runs tasks one after another, so a quick change
 * can't interleave its cancel/schedule with the previous run's and leave a
 * stale reminder behind. A failing task is logged and does not stop the next.
 */
export function createReminderQueue(
  failureLabel: string
): (task: () => Promise<void>) => Promise<void> {
  let queue: Promise<void> = Promise.resolve();
  return (task) => {
    queue = queue.then(task).catch((error: unknown) => {
      addLog(`${failureLabel}: ${String(error)}`, 'ERROR');
    });
    return queue;
  };
}
