import { ApiError } from '../../../src/services/api/errors';
import { TimeoutError } from '../../../src/utils/concurrency';
import {
  MAX_PENDING_ITEMS,
  backoffMs,
  classifyFailure,
  errorSummary,
  isNetworkFailure,
  itemsForConfig,
  moveToAttention,
  nextDrainable,
  parseQueueState,
  reconcileAccount,
  recordFailure,
  removeItem,
  shouldQueueAfterFailure,
  sortByAge,
} from '../../../src/services/offlineQueue/queueLogic';
import type { QueueState } from '../../../src/services/offlineQueue/types';
import { checkInItem, foodItem, waterItem } from '../../helpers/offlineQueue';

const state = (items = [foodItem('a')]): QueueState => ({
  items,
  attention: [],
  accounts: {},
});

describe('failure classification', () => {
  it('treats an unanswered request as a network failure', () => {
    expect(classifyFailure(new TimeoutError('Request', 10))).toBe('network');
    expect(classifyFailure(new TypeError('Network request failed'))).toBe(
      'network'
    );
    expect(classifyFailure(new Error('Failed to fetch'))).toBe('network');
  });

  it('keeps ApiErrors out of the network bucket whatever their message says', () => {
    const error = new ApiError('Network error upstream', 502);
    expect(isNetworkFailure(error)).toBe(false);
    expect(classifyFailure(error)).toBe('retry');
  });

  it('maps statuses: 401 auth, 408/429/5xx retry, other 4xx permanent', () => {
    expect(classifyFailure(new ApiError('x', 401))).toBe('auth');
    expect(classifyFailure(new ApiError('x', 408))).toBe('retry');
    expect(classifyFailure(new ApiError('x', 429))).toBe('retry');
    expect(classifyFailure(new ApiError('x', 500))).toBe('retry');
    expect(classifyFailure(new ApiError('x', 503))).toBe('retry');
    expect(classifyFailure(new ApiError('x', 400))).toBe('permanent');
    expect(classifyFailure(new ApiError('x', 403))).toBe('permanent');
    expect(classifyFailure(new ApiError('x', 404))).toBe('permanent');
    expect(classifyFailure(new ApiError('x', 422))).toBe('permanent');
  });

  it('retries an unrecognised error rather than discarding the entry', () => {
    expect(classifyFailure(new Error('Server configuration not found.'))).toBe(
      'retry'
    );
  });

  it('queues only after failures that say nothing about the request', () => {
    expect(shouldQueueAfterFailure(new TimeoutError('Request', 10))).toBe(true);
    expect(shouldQueueAfterFailure(new ApiError('x', 401))).toBe(true);
    expect(shouldQueueAfterFailure(new ApiError('x', 400))).toBe(false);
    expect(shouldQueueAfterFailure(new ApiError('x', 500))).toBe(false);
  });
});

describe('backoff', () => {
  it('doubles from 30 seconds and caps at 15 minutes', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(6)).toBe(900_000);
    expect(backoffMs(40)).toBe(900_000);
  });

  it('schedules a retry failure but not a network or auth failure', () => {
    const item = foodItem('a');
    const retried = recordFailure(
      item,
      'retry',
      new ApiError('Server error: 503', 503),
      1000
    );
    expect(retried.attempts).toBe(1);
    expect(retried.nextAttemptAt).toBe(1000 + 30_000);
    expect(retried.lastError).toContain('503');

    const offline = recordFailure(item, 'network', new TypeError('x'), 1000);
    expect(offline.attempts).toBe(1);
    expect(offline.nextAttemptAt).toBe(1000);
    expect(
      recordFailure(item, 'auth', new ApiError('x', 401), 1000).nextAttemptAt
    ).toBe(1000);
  });

  it('truncates a long error message', () => {
    expect(errorSummary(new Error('x'.repeat(1000))).length).toBeLessThan(310);
  });
});

describe('ordering and drain selection', () => {
  it('orders oldest first and keeps array order for equal timestamps', () => {
    const items = [
      foodItem('late', '2026-10-17T09:00:00.000Z'),
      foodItem('tie-1', '2026-10-17T08:00:00.000Z'),
      foodItem('tie-2', '2026-10-17T08:00:00.000Z'),
      foodItem('early', '2026-10-17T07:00:00.000Z'),
    ];
    expect(sortByAge(items).map((i) => i.id)).toEqual([
      'early',
      'tie-1',
      'tie-2',
      'late',
    ]);
  });

  it('only returns items of the requested config', () => {
    const other = { ...foodItem('x'), configId: 'config-2' };
    expect(itemsForConfig([foodItem('a'), other], 'config-1')).toHaveLength(1);
    expect(itemsForConfig([foodItem('a')], null)).toEqual([]);
  });

  it('takes the oldest item and does not skip past one that is backing off', () => {
    const waiting = foodItem('old', '2026-10-17T07:00:00.000Z', {
      nextAttemptAt: 5000,
    });
    const ready = waterItem('new');
    expect(nextDrainable([ready, waiting], 1000, false)).toBeNull();
    expect(nextDrainable([ready, waiting], 5000, false)?.id).toBe('old');
  });

  it('ignores the backoff when forced', () => {
    const waiting = foodItem('old', undefined, { nextAttemptAt: 99_999 });
    expect(nextDrainable([waiting], 1000, true)?.id).toBe('old');
  });

  it('returns null for an empty queue', () => {
    expect(nextDrainable([], 0, true)).toBeNull();
  });

  it('exposes a cap above zero', () => {
    expect(MAX_PENDING_ITEMS).toBeGreaterThan(0);
  });
});

describe('queue state transitions', () => {
  it('removes an item', () => {
    expect(
      removeItem(state([foodItem('a'), waterItem('b')]), 'a').items
    ).toHaveLength(1);
  });

  it('moves a rejected item to needs-attention with its reason and message', () => {
    const next = moveToAttention(
      state(),
      'a',
      'rejected',
      'Invalid meal type',
      5000
    );
    expect(next.items).toEqual([]);
    expect(next.attention).toHaveLength(1);
    expect(next.attention[0]).toMatchObject({
      id: 'a',
      reason: 'rejected',
      message: 'Invalid meal type',
    });
    expect(next.attention[0].movedAt).toBe(new Date(5000).toISOString());
  });

  it('leaves the state alone for an unknown id', () => {
    const before = state();
    expect(moveToAttention(before, 'nope', 'rejected', 'x', 0)).toBe(before);
  });
});

describe('account reconciliation', () => {
  it('stamps unstamped items and remembers the account', () => {
    const next = reconcileAccount(state(), 'config-1', 'user-1', 0);
    expect(next.items[0].accountId).toBe('user-1');
    expect(next.accounts['config-1']).toBe('user-1');
  });

  it('holds items stamped for a different account instead of sending them', () => {
    const mine = { ...foodItem('mine'), accountId: 'user-1' };
    const theirs = { ...foodItem('theirs'), accountId: 'user-2' };
    const next = reconcileAccount(
      state([mine, theirs]),
      'config-1',
      'user-1',
      0
    );
    expect(next.items.map((i) => i.id)).toEqual(['mine']);
    expect(next.attention).toHaveLength(1);
    expect(next.attention[0]).toMatchObject({
      id: 'theirs',
      reason: 'account_mismatch',
    });
  });

  it('does not touch items of other configs', () => {
    const elsewhere = {
      ...foodItem('x'),
      configId: 'config-2',
      accountId: 'user-9',
    };
    const next = reconcileAccount(state([elsewhere]), 'config-1', 'user-1', 0);
    expect(next.items[0]).toBe(elsewhere);
  });

  it('returns the same object when nothing changes', () => {
    const settled: QueueState = {
      items: [{ ...foodItem('a'), accountId: 'user-1' }],
      attention: [],
      accounts: { 'config-1': 'user-1' },
    };
    expect(reconcileAccount(settled, 'config-1', 'user-1', 0)).toBe(settled);
  });
});

describe('parseQueueState', () => {
  it('round-trips a valid state', () => {
    const original: QueueState = {
      items: [foodItem('a'), waterItem('b'), checkInItem('c')],
      attention: [],
      accounts: { 'config-1': 'user-1' },
    };
    const { state: parsed, invalid } = parseQueueState(
      JSON.parse(JSON.stringify(original))
    );
    expect(parsed).toEqual(original);
    expect(invalid).toEqual([]);
  });

  it('separates malformed entries instead of failing the whole queue', () => {
    const { state: parsed, invalid } = parseQueueState({
      items: [foodItem('a'), { id: 'broken' }, null, 'text'],
      attention: [{ id: 'x' }],
    });
    expect(parsed.items.map((i) => i.id)).toEqual(['a']);
    expect(invalid).toHaveLength(4);
  });

  it('rejects an envelope of the wrong shape', () => {
    expect(() => parseQueueState(null)).toThrow();
    expect(() => parseQueueState({ items: 'nope' })).toThrow();
    expect(() => parseQueueState([])).toThrow();
  });

  it('rejects an item whose payload does not match its kind', () => {
    const { state: parsed } = parseQueueState({
      items: [
        { ...waterItem('w'), payload: {} },
        { ...foodItem('f'), preview: null },
      ],
    });
    expect(parsed.items).toEqual([]);
  });
});
