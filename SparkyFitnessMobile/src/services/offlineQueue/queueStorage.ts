import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from '../LogService';
import { parseQueueState } from './queueLogic';
import type { QueueState } from './types';

const QUEUE_KEY = '@SparkyFitness/offlineQueue';
/** Raw values that could not be read back, kept so nothing is lost silently. */
const CORRUPT_KEY = '@SparkyFitness/offlineQueue.corrupt';
const MAX_CORRUPT_BYTES = 200_000;

export const EMPTY_QUEUE: QueueState = {
  items: [],
  attention: [],
  accounts: {},
};

async function quarantine(raw: string, reason: string): Promise<void> {
  addLog(`[Offline Queue] ${reason}; keeping a copy of the data.`, 'ERROR');
  try {
    await AsyncStorage.setItem(CORRUPT_KEY, raw.slice(0, MAX_CORRUPT_BYTES));
  } catch (error) {
    addLog(
      `[Offline Queue] Could not keep the unreadable data: ${error}`,
      'ERROR'
    );
  }
}

export async function readQueue(): Promise<QueueState> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(QUEUE_KEY);
  } catch (error) {
    addLog(`[Offline Queue] Could not read the queue: ${error}`, 'ERROR');
    throw error;
  }
  if (!raw) return EMPTY_QUEUE;
  try {
    const { state, invalid } = parseQueueState(JSON.parse(raw));
    if (invalid.length > 0) {
      await quarantine(
        JSON.stringify(invalid),
        `${invalid.length} queued entr${invalid.length === 1 ? 'y was' : 'ies were'} unreadable`
      );
    }
    return state;
  } catch {
    await quarantine(raw, 'The stored queue is unreadable');
    return EMPTY_QUEUE;
  }
}

// Reads and writes on the queue key must not interleave: two enqueues racing a
// drain would otherwise lose one of the writes.
let chain: Promise<unknown> = Promise.resolve();

/**
 * Applies `change` to the stored queue and persists the result before
 * resolving. Calls run strictly one after another.
 */
export function updateQueue(
  change: (state: QueueState) => QueueState
): Promise<QueueState> {
  const run = async (): Promise<QueueState> => {
    const current = await readQueue();
    const next = change(current);
    if (next !== current) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
    }
    return next;
  };
  const result = chain.then(run, run);
  chain = result.catch(() => undefined);
  return result;
}
