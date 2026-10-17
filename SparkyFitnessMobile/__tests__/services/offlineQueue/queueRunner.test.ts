import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '../../../src/services/api/errors';
import {
  NeedsConnectionError,
  QueueFullError,
  createDrain,
  submitOrQueue,
  type NewQueueItem,
  type RunnerDeps,
} from '../../../src/services/offlineQueue/queueRunner';
import { MAX_PENDING_ITEMS } from '../../../src/services/offlineQueue/queueLogic';
import { useOfflineQueueStore } from '../../../src/stores/offlineQueueStore';
import { getActiveServerConfig } from '../../../src/services/storage';
import { TimeoutError } from '../../../src/utils/concurrency';
import type { QueueItem } from '../../../src/services/offlineQueue/types';
import { checkInItem, foodItem, waterItem } from '../../helpers/offlineQueue';

jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));
jest.mock('../../../src/utils/ids', () => ({ newUuid: () => 'minted-id' }));

const mockedConfig = jest.mocked(getActiveServerConfig);

async function seed(items: QueueItem[]) {
  await useOfflineQueueStore.getState().commit((s) => ({ ...s, items }));
}

const initialStore = useOfflineQueueStore.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  useOfflineQueueStore.setState({
    ...initialStore,
    items: [],
    attention: [],
    accounts: {},
    settling: [],
    deviceOffline: false,
    draining: false,
    activeConfigId: null,
  });
  mockedConfig.mockResolvedValue({
    id: 'config-1',
    url: 'https://example.test',
    apiKey: '',
  });
});

const deps = (overrides: Partial<RunnerDeps> = {}): RunnerDeps => ({
  send: jest.fn().mockResolvedValue(undefined),
  fetchAccountId: jest.fn().mockResolvedValue('user-1'),
  getConfigId: jest.fn().mockResolvedValue('config-1'),
  now: () => 1_000_000,
  refresh: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const ids = () => useOfflineQueueStore.getState().items.map((i) => i.id);

describe('drain', () => {
  it('sends oldest first, empties the queue and refreshes once with what it sent', async () => {
    const d = deps();
    await seed([
      checkInItem('third', '2026-10-17T10:00:00.000Z'),
      foodItem('first', '2026-10-17T08:00:00.000Z'),
      waterItem('second', '2026-10-17T09:00:00.000Z'),
    ]);

    const result = await createDrain(d)();

    expect(jest.mocked(d.send).mock.calls.map(([item]) => item.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(result).toEqual({ sent: 3, needsAttention: 0, stopped: 'done' });
    expect(ids()).toEqual([]);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(jest.mocked(d.refresh).mock.calls[0][0].map((i) => i.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('keeps sent items visible until the refresh settles', async () => {
    let release: () => void = () => undefined;
    const d = deps({
      refresh: () => new Promise<void>((resolve) => (release = resolve)),
    });
    await seed([foodItem('a')]);

    const running = createDrain(d)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useOfflineQueueStore.getState().settling.map((i) => i.id)).toEqual([
      'a',
    ]);
    expect(ids()).toEqual([]);

    release();
    await running;
    expect(useOfflineQueueStore.getState().settling).toEqual([]);
  });

  it('stops at a network failure and keeps the failed and later items in order', async () => {
    const d = deps({
      send: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new TimeoutError('Request', 10)),
    });
    await seed([
      foodItem('a', '2026-10-17T08:00:00.000Z'),
      foodItem('b', '2026-10-17T08:01:00.000Z'),
      foodItem('c', '2026-10-17T08:02:00.000Z'),
    ]);

    const result = await createDrain(d)();

    expect(result).toMatchObject({ sent: 1, stopped: 'network' });
    expect(ids()).toEqual(['b', 'c']);
    const failed = useOfflineQueueStore.getState().items[0];
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toContain('timed out');
    expect(d.send).toHaveBeenCalledTimes(2);
  });

  it('backs a 5xx off, leaves it alone until due, and sends it when forced', async () => {
    let now = 1_000_000;
    const send = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('Server error: 503', 503))
      .mockResolvedValue(undefined);
    const drain = createDrain(deps({ send, now: () => now }));
    await seed([foodItem('a')]);

    expect(await drain()).toMatchObject({ stopped: 'retry' });
    expect(useOfflineQueueStore.getState().items[0].nextAttemptAt).toBe(
      1_030_000
    );

    now = 1_010_000;
    expect(await drain()).toMatchObject({ sent: 0, stopped: 'done' });
    expect(send).toHaveBeenCalledTimes(1);

    expect(await drain({ force: true })).toMatchObject({ sent: 1 });
    expect(ids()).toEqual([]);
  });

  it('sends a due item once its backoff has passed', async () => {
    let now = 1_000_000;
    const send = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('Server error: 500', 500))
      .mockResolvedValue(undefined);
    const drain = createDrain(deps({ send, now: () => now }));
    await seed([foodItem('a')]);
    await drain();
    now = 1_031_000;
    expect(await drain()).toMatchObject({ sent: 1 });
  });

  it('moves a permanently rejected item to needs-attention and carries on', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          'Server error: 400 - bad',
          400,
          '{"error":"Invalid meal type"}'
        )
      )
      .mockResolvedValue(undefined);
    await seed([
      foodItem('bad', '2026-10-17T08:00:00.000Z'),
      foodItem('good', '2026-10-17T08:01:00.000Z'),
    ]);

    const result = await createDrain(deps({ send }))();

    expect(result).toEqual({ sent: 1, needsAttention: 1, stopped: 'done' });
    const { attention } = useOfflineQueueStore.getState();
    expect(attention.map((a) => a.id)).toEqual(['bad']);
    expect(attention[0].reason).toBe('rejected');
    expect(ids()).toEqual([]);
  });

  it('persists needs-attention so it survives a restart', async () => {
    const send = jest
      .fn()
      .mockRejectedValue(new ApiError('Server error: 422', 422));
    await seed([foodItem('bad')]);
    await createDrain(deps({ send }))();

    await useOfflineQueueStore.getState().hydrate('config-1');
    expect(useOfflineQueueStore.getState().attention.map((a) => a.id)).toEqual([
      'bad',
    ]);
  });

  it('stops on a 401 and keeps everything for after re-auth', async () => {
    const send = jest
      .fn()
      .mockRejectedValue(new ApiError('Server error: 401', 401));
    await seed([foodItem('a'), foodItem('b', '2026-10-17T08:30:00.000Z')]);

    const result = await createDrain(deps({ send }))();

    expect(result.stopped).toBe('auth');
    expect(ids()).toEqual(['a', 'b']);
    expect(send).toHaveBeenCalledTimes(1);
    expect(useOfflineQueueStore.getState().attention).toEqual([]);
  });

  it('does not send anything when the account check cannot reach the server', async () => {
    const d = deps({
      fetchAccountId: jest
        .fn()
        .mockRejectedValue(new TypeError('Network request failed')),
    });
    await seed([foodItem('a')]);

    expect(await createDrain(d)()).toMatchObject({
      sent: 0,
      stopped: 'network',
    });
    expect(d.send).not.toHaveBeenCalled();
    expect(ids()).toEqual(['a']);
  });

  it('holds items that belong to another account and sends the rest', async () => {
    const d = deps();
    await seed([
      { ...foodItem('mine', '2026-10-17T08:00:00.000Z'), accountId: 'user-1' },
      {
        ...foodItem('theirs', '2026-10-17T08:01:00.000Z'),
        accountId: 'user-2',
      },
    ]);

    const result = await createDrain(d)();

    expect(jest.mocked(d.send).mock.calls.map(([i]) => i.id)).toEqual(['mine']);
    expect(result.sent).toBe(1);
    expect(useOfflineQueueStore.getState().attention[0]).toMatchObject({
      id: 'theirs',
      reason: 'account_mismatch',
    });
    expect(useOfflineQueueStore.getState().accounts['config-1']).toBe('user-1');
  });

  it("leaves other servers' items alone", async () => {
    const d = deps();
    await seed([{ ...foodItem('elsewhere'), configId: 'config-2' }]);
    expect(await createDrain(d)()).toMatchObject({ sent: 0 });
    expect(d.send).not.toHaveBeenCalled();
    expect(ids()).toEqual(['elsewhere']);
  });

  it('reports no server when none is configured', async () => {
    const d = deps({ getConfigId: jest.fn().mockResolvedValue(null) });
    expect(await createDrain(d)()).toMatchObject({ stopped: 'no_server' });
  });

  it('runs one pass at a time and lets a second caller join it', async () => {
    const d = deps();
    await seed([foodItem('a'), foodItem('b', '2026-10-17T08:30:00.000Z')]);
    const drain = createDrain(d);

    const [first, second] = await Promise.all([drain(), drain()]);

    expect(first).toBe(second);
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(useOfflineQueueStore.getState().draining).toBe(false);
  });
});

describe('submitOrQueue', () => {
  const queueAs = (): NewQueueItem => ({
    kind: 'water',
    entryDate: '2026-10-17',
    payload: { containerId: 3 },
    previewMl: 250,
  });

  it('returns the result of a write that goes through and queues nothing', async () => {
    const send = jest.fn().mockResolvedValue({ ok: true });
    const out = await submitOrQueue({ send, queueAs });
    expect(out).toEqual({ status: 'sent', result: { ok: true } });
    expect(send).toHaveBeenCalledWith('minted-id', expect.any(Number));
    expect(ids()).toEqual([]);
  });

  it('queues a write that timed out, under the id the first attempt used', async () => {
    const send = jest.fn().mockRejectedValue(new TimeoutError('Request', 10));
    const out = await submitOrQueue({ send, queueAs });
    expect(out.status).toBe('queued');
    expect(ids()).toEqual(['minted-id']);
    const [stored] = useOfflineQueueStore.getState().items;
    expect(stored).toMatchObject({
      configId: 'config-1',
      accountId: null,
      attempts: 0,
    });
  });

  it('stamps the known account on the queued item', async () => {
    useOfflineQueueStore.setState({ accounts: { 'config-1': 'user-1' } });
    await submitOrQueue({
      send: jest
        .fn()
        .mockRejectedValue(new TypeError('Network request failed')),
      queueAs,
    });
    expect(useOfflineQueueStore.getState().items[0].accountId).toBe('user-1');
  });

  it('goes straight to the queue when the device is offline', async () => {
    useOfflineQueueStore.setState({ deviceOffline: true });
    const send = jest.fn();
    const out = await submitOrQueue({ send, queueAs });
    expect(out.status).toBe('queued');
    expect(send).not.toHaveBeenCalled();
  });

  it('queues after a 401 so the entry survives the re-login', async () => {
    const out = await submitOrQueue({
      send: jest.fn().mockRejectedValue(new ApiError('Server error: 401', 401)),
      queueAs,
    });
    expect(out.status).toBe('queued');
  });

  it('rethrows a rejection and a server error, queueing nothing', async () => {
    for (const status of [400, 500]) {
      const error = new ApiError(`Server error: ${status}`, status);
      await expect(
        submitOrQueue({ send: jest.fn().mockRejectedValue(error), queueAs })
      ).rejects.toBe(error);
    }
    expect(ids()).toEqual([]);
  });

  it('says it needs a connection when the write cannot wait', async () => {
    useOfflineQueueStore.setState({ deviceOffline: true });
    await expect(
      submitOrQueue({ send: jest.fn(), queueAs: null })
    ).rejects.toBeInstanceOf(NeedsConnectionError);
  });

  it('rethrows the network error of a write that cannot wait', async () => {
    const error = new TimeoutError('Request', 10);
    await expect(
      submitOrQueue({ send: jest.fn().mockRejectedValue(error), queueAs: null })
    ).rejects.toBe(error);
    expect(ids()).toEqual([]);
  });

  it('refuses a new write once the queue is full', async () => {
    await seed(
      Array.from({ length: MAX_PENDING_ITEMS }, (_, i) =>
        foodItem(
          `f${i}`,
          `2026-10-17T08:${String(i % 60).padStart(2, '0')}:00.000Z`
        )
      )
    );
    useOfflineQueueStore.setState({ deviceOffline: true });
    await expect(
      submitOrQueue({ send: jest.fn(), queueAs })
    ).rejects.toBeInstanceOf(QueueFullError);
    expect(ids()).toHaveLength(MAX_PENDING_ITEMS);
  });

  it('cannot queue a write when no server is configured', async () => {
    mockedConfig.mockResolvedValue(null);
    useOfflineQueueStore.setState({ deviceOffline: true });
    await expect(submitOrQueue({ send: jest.fn(), queueAs })).rejects.toThrow(
      'Server configuration not found.'
    );
  });
});
