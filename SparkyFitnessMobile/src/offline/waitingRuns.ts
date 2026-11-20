import { discardWaitingWatchRun } from '../services/watchRunQueue';
import { discardQueuedRun } from './runHandOver';

/**
 * Removes a run that is only on the phone, whichever queue holds it: one the
 * phone recorded (the upload queue) or one the watch recorded alone (the
 * watch run queue). False when none is waiting, or it is already on the
 * server.
 */
export async function discardWaitingRun(entryId: string): Promise<boolean> {
  return (
    (await discardQueuedRun(entryId)) || (await discardWaitingWatchRun(entryId))
  );
}
