import { discardWaitingWatchRun } from '../services/watchRunQueue';
import { discardQueuedRun, queueRunDelete } from './runHandOver';

/**
 * Removes a run that has not finished uploading, whichever queue holds it: one
 * the phone recorded (the upload queue) or one the watch recorded alone (the
 * watch run queue). A run an attempt already put on the server is removed
 * there as well, through a queued delete. False when no such run is waiting.
 */
export async function discardWaitingRun(entryId: string): Promise<boolean> {
  const phone = await discardQueuedRun(entryId);
  const result =
    phone.outcome !== 'none' ? phone : await discardWaitingWatchRun(entryId);
  if (result.outcome === 'none') return false;
  if (result.outcome === 'on_server') {
    return queueRunDelete(entryId, result.entryDate);
  }
  return true;
}
