import { queryClient } from '../../hooks/queryClient';
import { invalidateOfflineQueueCaches } from '../../hooks/invalidateOfflineQueueCaches';
import { serverConnectionQueryKey } from '../../hooks/queryKeys';
import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { newUuid } from '../../utils/ids';
import { createFoodEntry } from '../api/foodEntriesApi';
import { changeWaterIntake, upsertCheckIn } from '../api/measurementsApi';
import { fetchAuthenticatedUserId } from '../api/profileApi';
import { addLog } from '../LogService';
import { getActiveServerConfig } from '../storage';
import {
  FIRST_ATTEMPT_TIMEOUT_MS,
  MAX_PENDING_ITEMS,
  classifyFailure,
  errorSummary,
  itemsForConfig,
  moveToAttention,
  nextDrainable,
  reconcileAccount,
  recordFailure,
  removeItem,
  replaceItem,
  shouldQueueAfterFailure,
} from './queueLogic';
import type { QueueItem } from './types';

/** Shorter first attempt when the last connection check already failed. */
const KNOWN_UNREACHABLE_TIMEOUT_MS = 4_000;

/** The write needs the server, and the server cannot be reached. */
export class NeedsConnectionError extends Error {
  constructor() {
    super('This needs a connection to your server.');
    this.name = 'NeedsConnectionError';
  }
}

/** The queue is full; nothing more is accepted until it drains. */
export class QueueFullError extends Error {
  constructor() {
    super('Too many entries are waiting to sync.');
    this.name = 'QueueFullError';
  }
}

export type DrainStop = 'done' | 'network' | 'auth' | 'retry' | 'no_server';

export interface DrainResult {
  sent: number;
  needsAttention: number;
  stopped: DrainStop;
}

export interface RunnerDeps {
  send: (item: QueueItem) => Promise<unknown>;
  fetchAccountId: () => Promise<string>;
  getConfigId: () => Promise<string | null>;
  now: () => number;
  /** Refreshes caches for what was just sent; resolves when refetches settle. */
  refresh: (sent: readonly QueueItem[]) => Promise<void>;
}

export async function sendQueueItem(item: QueueItem): Promise<void> {
  switch (item.kind) {
    case 'food_entry':
      await createFoodEntry({ ...item.payload, client_id: item.id });
      return;
    case 'water':
      await changeWaterIntake({
        entryDate: item.entryDate,
        changeDrinks: 1,
        containerId: item.payload.containerId,
        clientId: item.id,
      });
      return;
    case 'check_in':
      await upsertCheckIn(item.payload);
      return;
  }
}

const defaultDeps: RunnerDeps = {
  send: sendQueueItem,
  fetchAccountId: fetchAuthenticatedUserId,
  getConfigId: async () => (await getActiveServerConfig())?.id ?? null,
  now: () => Date.now(),
  refresh: (sent) => invalidateOfflineQueueCaches(queryClient, sent),
};

/**
 * Builds the drain function. At most one pass runs at a time; a call made while
 * one is running joins it instead of starting a second.
 */
export function createDrain(deps: RunnerDeps) {
  const store = () => useOfflineQueueStore.getState();
  let inFlight: Promise<DrainResult> | null = null;

  async function pass(force: boolean): Promise<DrainResult> {
    const result: DrainResult = { sent: 0, needsAttention: 0, stopped: 'done' };
    const configId = await deps.getConfigId();
    if (!configId) return { ...result, stopped: 'no_server' };
    store().setActiveConfigId(configId);
    if (itemsForConfig(store().items, configId).length === 0) return result;

    store().setDraining(true);
    const sent: QueueItem[] = [];
    try {
      try {
        const accountId = await deps.fetchAccountId();
        await store().commit((state) =>
          reconcileAccount(state, configId, accountId, deps.now())
        );
      } catch (error) {
        const kind = classifyFailure(error);
        addLog(
          `[Offline Queue] Could not confirm the signed-in account: ${errorSummary(error)}`,
          'WARNING'
        );
        if (kind === 'permanent') {
          // A rejected identity check says nothing about the entries; leave
          // them queued and let the next trigger try again.
          return { ...result, stopped: 'retry' };
        }
        return { ...result, stopped: kind };
      }

      for (;;) {
        const next = nextDrainable(
          itemsForConfig(store().items, configId),
          deps.now(),
          force
        );
        if (!next) break;
        try {
          await deps.send(next);
        } catch (error) {
          const kind = classifyFailure(error);
          if (kind === 'permanent') {
            addLog(
              `[Offline Queue] ${next.kind} entry rejected: ${errorSummary(error)}`,
              'ERROR'
            );
            await store().commit((state) =>
              moveToAttention(
                state,
                next.id,
                'rejected',
                errorSummary(error),
                deps.now()
              )
            );
            result.needsAttention += 1;
            continue;
          }
          await store().commit((state) =>
            replaceItem(state, recordFailure(next, kind, error, deps.now()))
          );
          return finish(sent, result, kind);
        }
        // Persist the removal before anything else so a crash here cannot
        // send it twice (the server would dedupe it, but not for free).
        await store().commit((state) => removeItem(state, next.id));
        store().addSettling(next);
        sent.push(next);
        result.sent += 1;
      }
      return finish(sent, result, 'done');
    } finally {
      store().setDraining(false);
    }
  }

  async function finish(
    sent: readonly QueueItem[],
    result: DrainResult,
    stopped: DrainStop
  ): Promise<DrainResult> {
    result.stopped = stopped;
    if (sent.length > 0) {
      try {
        await deps.refresh(sent);
      } finally {
        store().removeSettling(sent.map((item) => item.id));
      }
    }
    return result;
  }

  return function drain(options?: { force?: boolean }): Promise<DrainResult> {
    if (!inFlight) {
      inFlight = pass(options?.force === true).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

export const drainQueue = createDrain(defaultDeps);

/** What the first attempt of a queueable write should do. */
export function firstAttemptTimeoutMs(): number {
  return queryClient.getQueryData(serverConnectionQueryKey) === false
    ? KNOWN_UNREACHABLE_TIMEOUT_MS
    : FIRST_ATTEMPT_TIMEOUT_MS;
}

/** True when sending would certainly fail, so the write goes straight to the queue. */
export function isKnownOffline(): boolean {
  return useOfflineQueueStore.getState().deviceOffline;
}

type StampedKey =
  'id' | 'configId' | 'accountId' | 'createdAt' | 'attempts' | 'nextAttemptAt';

/** A queue item before the runner stamps its id, owner and bookkeeping. */
export type NewQueueItem = QueueItem extends infer Item
  ? Item extends QueueItem
    ? Omit<Item, StampedKey>
    : never
  : never;

/** Stands in for a server response when a write went to the queue instead. */
export interface QueuedWrite {
  queued: true;
}

export const QUEUED_WRITE: QueuedWrite = { queued: true };

export function isQueuedWrite(value: unknown): value is QueuedWrite {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { queued?: unknown }).queued === true
  );
}

export type SubmitOutcome<T> =
  { status: 'sent'; result: T } | { status: 'queued'; item: QueueItem };

/**
 * Sends a write now, or parks it in the queue when the server cannot be
 * reached. The id is minted before the first attempt and travels with it, so a
 * request that timed out but committed is recognised when the queue replays
 * it. A `null` `queueAs` means the write cannot wait (it needs the server's
 * answer first): offline it fails with NeedsConnectionError instead.
 */
export async function submitOrQueue<T>(params: {
  send: (clientId: string, timeoutMs: number) => Promise<T>;
  queueAs: ((clientId: string) => NewQueueItem) | null;
}): Promise<SubmitOutcome<T>> {
  const id = newUuid();

  const park = async (cause: unknown): Promise<SubmitOutcome<T>> => {
    if (!params.queueAs) {
      throw cause instanceof Error ? cause : new NeedsConnectionError();
    }
    const config = await getActiveServerConfig();
    if (!config) throw new Error('Server configuration not found.');
    const base = {
      id,
      configId: config.id,
      accountId: useOfflineQueueStore.getState().accounts[config.id] ?? null,
      createdAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: 0,
    };
    const item = { ...params.queueAs(id), ...base } as QueueItem;
    let full = false;
    await useOfflineQueueStore.getState().commit((state) => {
      if (itemsForConfig(state.items, config.id).length >= MAX_PENDING_ITEMS) {
        full = true;
        return state;
      }
      return { ...state, items: [...state.items, item] };
    });
    if (full) throw new QueueFullError();
    addLog(
      `[Offline Queue] Queued ${item.kind} entry for ${item.entryDate}.`,
      'INFO'
    );
    return { status: 'queued', item };
  };

  if (isKnownOffline()) return park(new NeedsConnectionError());

  try {
    return {
      status: 'sent',
      result: await params.send(id, firstAttemptTimeoutMs()),
    };
  } catch (error) {
    if (!shouldQueueAfterFailure(error)) throw error;
    return park(error);
  }
}
