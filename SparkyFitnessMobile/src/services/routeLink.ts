import { ApiError } from './api/errors';
import { attachExerciseEntryRoute } from './api/routeApi';
import { addLog } from './LogService';

/**
 * Links a filed run or walk to the saved route it followed. A route deleted
 * in the meantime (404) just means there is nothing to link, so it is logged
 * and skipped; any other failure is thrown so the caller's retry runs it again
 * (the server call is idempotent).
 */
export async function linkEntryToRoute(
  entryId: string,
  routeId: string
): Promise<void> {
  try {
    await attachExerciseEntryRoute(entryId, routeId);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) {
      addLog(
        `[Routes] Not linking run ${entryId}: route ${routeId} is gone`,
        'WARNING'
      );
      return;
    }
    throw error;
  }
}
