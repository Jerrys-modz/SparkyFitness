import { ApiError } from '../api/errors';
import { TimeoutError } from '../../utils/concurrency';
import type {
  AttentionItem,
  AttentionReason,
  QueueItem,
  QueueItemKind,
  QueueState,
} from './types';

/** A full queue refuses new writes rather than dropping old ones. */
export const MAX_PENDING_ITEMS = 200;
/** How long a first attempt waits before the write is queued instead. */
export const FIRST_ATTEMPT_TIMEOUT_MS = 10_000;

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 15 * 60_000;
const MAX_ERROR_LENGTH = 300;

/**
 * - `network`: the request never got an answer (offline, unreachable, timeout).
 * - `auth`: 401; the session has to be renewed before anything can be sent.
 * - `retry`: the server answered with something that may pass (5xx, 408, 429).
 * - `permanent`: any other 4xx; resending the same request cannot succeed.
 */
export type FailureKind = 'network' | 'auth' | 'retry' | 'permanent';

export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  if (error instanceof TimeoutError) return true;
  if (error instanceof TypeError) return true;
  return (
    error instanceof Error &&
    /network request failed|failed to fetch|network error/i.test(error.message)
  );
}

export function classifyFailure(error: unknown): FailureKind {
  if (error instanceof ApiError) {
    const status = error.statusCode;
    if (status === 401) return 'auth';
    if (status === 408 || status === 429) return 'retry';
    if (status >= 400 && status < 500) return 'permanent';
    return 'retry';
  }
  if (isNetworkFailure(error)) return 'network';
  return 'retry';
}

/**
 * Whether a write that just failed should be parked in the queue. Only
 * failures that say nothing about the request itself qualify: an unanswered
 * request, or a session that has to be renewed. Anything else (a 4xx, a 5xx)
 * keeps today's behaviour of reporting the error to the person.
 */
export function shouldQueueAfterFailure(error: unknown): boolean {
  const kind = classifyFailure(error);
  return kind === 'network' || kind === 'auth';
}

export function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
}

export function errorSummary(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > MAX_ERROR_LENGTH
    ? `${text.slice(0, MAX_ERROR_LENGTH)}...`
    : text;
}

/** Oldest first; the array order breaks ties between identical timestamps. */
export function sortByAge(items: readonly QueueItem[]): QueueItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        a.item.createdAt.localeCompare(b.item.createdAt) || a.index - b.index
    )
    .map(({ item }) => item);
}

export function itemsForConfig(
  items: readonly QueueItem[],
  configId: string | null | undefined
): QueueItem[] {
  if (!configId) return [];
  return sortByAge(items.filter((item) => item.configId === configId));
}

/**
 * The item a drain pass should send next, or null when it should stop. A pass
 * always takes the oldest item, so a later write never overtakes an earlier
 * one; an item still backing off holds the pass unless it is forced.
 */
export function nextDrainable(
  items: readonly QueueItem[],
  now: number,
  force: boolean
): QueueItem | null {
  const [oldest] = sortByAge(items);
  if (!oldest) return null;
  if (!force && oldest.nextAttemptAt > now) return null;
  return oldest;
}

/** The item after a failed attempt, with its next attempt scheduled. */
export function recordFailure(
  item: QueueItem,
  kind: Extract<FailureKind, 'network' | 'auth' | 'retry'>,
  error: unknown,
  now: number
): QueueItem {
  const attempts = item.attempts + 1;
  // A network or auth failure says nothing about this item: it goes again as
  // soon as the connection or the session is back, so it does not back off.
  const nextAttemptAt = kind === 'retry' ? now + backoffMs(attempts) : now;
  return { ...item, attempts, nextAttemptAt, lastError: errorSummary(error) };
}

export function toAttention(
  item: QueueItem,
  reason: AttentionReason,
  message: string,
  now: number
): AttentionItem {
  return { ...item, reason, message, movedAt: new Date(now).toISOString() };
}

export function removeItem(state: QueueState, id: string): QueueState {
  return { ...state, items: state.items.filter((item) => item.id !== id) };
}

export function replaceItem(state: QueueState, next: QueueItem): QueueState {
  return {
    ...state,
    items: state.items.map((item) => (item.id === next.id ? next : item)),
  };
}

export function moveToAttention(
  state: QueueState,
  id: string,
  reason: AttentionReason,
  message: string,
  now: number
): QueueState {
  const item = state.items.find((candidate) => candidate.id === id);
  if (!item) return state;
  return {
    ...state,
    items: state.items.filter((candidate) => candidate.id !== id),
    attention: [...state.attention, toAttention(item, reason, message, now)],
  };
}

export function dismissAttention(state: QueueState, id: string): QueueState {
  return {
    ...state,
    attention: state.attention.filter((item) => item.id !== id),
  };
}

/**
 * Items stamped for another account are never sent. Unstamped ones adopt the
 * signed-in account. Returns the same object when nothing needs to change.
 */
export function reconcileAccount(
  state: QueueState,
  configId: string,
  accountId: string,
  now: number
): QueueState {
  let changed = false;
  const items: QueueItem[] = [];
  const attention = [...state.attention];
  for (const item of state.items) {
    if (item.configId !== configId) {
      items.push(item);
    } else if (item.accountId === null) {
      changed = true;
      items.push({ ...item, accountId });
    } else if (item.accountId === accountId) {
      items.push(item);
    } else {
      changed = true;
      attention.push(
        toAttention(
          item,
          'account_mismatch',
          'This entry was made while signed in as a different account.',
          now
        )
      );
    }
  }
  const accountChanged = state.accounts[configId] !== accountId;
  if (!changed && !accountChanged) return state;
  return {
    items,
    attention,
    accounts: { ...state.accounts, [configId]: accountId },
  };
}

const KINDS: readonly QueueItemKind[] = ['food_entry', 'water', 'check_in'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Shape guard for what comes back from storage; never trusts the JSON. */
export function isQueueItem(value: unknown): value is QueueItem {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' ||
    typeof value.configId !== 'string' ||
    typeof value.entryDate !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.attempts !== 'number' ||
    typeof value.nextAttemptAt !== 'number' ||
    !(value.accountId === null || typeof value.accountId === 'string') ||
    !KINDS.includes(value.kind as QueueItemKind) ||
    !isRecord(value.payload)
  ) {
    return false;
  }
  if (value.kind === 'food_entry') return isRecord(value.preview);
  if (value.kind === 'water')
    return typeof value.payload.containerId === 'number';
  return typeof value.payload.entryDate === 'string';
}

export interface ParsedQueue {
  state: QueueState;
  /** Entries that were present but failed the shape check. */
  invalid: unknown[];
}

/**
 * Reads a stored queue. Throws on anything that is not the expected envelope
 * so the caller can quarantine the raw value; individual malformed entries
 * are returned in `invalid` instead of failing the whole queue.
 */
export function parseQueueState(raw: unknown): ParsedQueue {
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    throw new Error('Offline queue has an unexpected shape.');
  }
  const attentionRaw = Array.isArray(raw.attention) ? raw.attention : [];
  const invalid: unknown[] = [];
  const items = raw.items.filter((entry): entry is QueueItem => {
    const ok = isQueueItem(entry);
    if (!ok) invalid.push(entry);
    return ok;
  });
  const accounts: Record<string, string> = {};
  if (isRecord(raw.accounts)) {
    for (const [configId, accountId] of Object.entries(raw.accounts)) {
      if (typeof accountId === 'string') accounts[configId] = accountId;
    }
  }
  const attention = attentionRaw.filter((entry): entry is AttentionItem => {
    const ok =
      isQueueItem(entry) &&
      typeof (entry as unknown as Record<string, unknown>).message ===
        'string' &&
      typeof (entry as unknown as Record<string, unknown>).reason === 'string';
    if (!ok) invalid.push(entry);
    return ok;
  });
  return { state: { items, attention, accounts }, invalid };
}
