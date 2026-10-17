import { fetchRouteGhost } from './api/routeApi';
import { addLog } from './LogService';
import { encodeWatchGhost } from '../utils/watchRoute';

/**
 * The route's best run as the watch's pace line, or null when it has none or
 * the server cannot say. Best effort: a route still goes to the watch without
 * a ghost, so a failed lookup is logged and never blocks sending or starting.
 */
export async function loadWatchGhost(
  routeId: string
): Promise<number[] | null> {
  try {
    const { ghost } = await fetchRouteGhost(routeId);
    return encodeWatchGhost(ghost);
  } catch (error) {
    addLog(`[Watch Route] No ghost for ${routeId}: ${error}`, 'DEBUG');
    return null;
  }
}
