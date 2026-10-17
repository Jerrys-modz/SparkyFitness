import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  readQueue,
  updateQueue,
} from '../../../src/services/offlineQueue/queueStorage';
import { foodItem, waterItem } from '../../helpers/offlineQueue';

jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

const QUEUE_KEY = '@SparkyFitness/offlineQueue';
const CORRUPT_KEY = '@SparkyFitness/offlineQueue.corrupt';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('queue storage', () => {
  it('reads an empty queue when nothing is stored', async () => {
    expect(await readQueue()).toEqual({
      items: [],
      attention: [],
      accounts: {},
    });
  });

  it('persists a change before resolving', async () => {
    await updateQueue((s) => ({ ...s, items: [foodItem('a')] }));
    const stored = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '{}');
    expect(stored.items.map((i: { id: string }) => i.id)).toEqual(['a']);
  });

  it('does not lose writes when several land at once', async () => {
    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((id) =>
        updateQueue((s) => ({ ...s, items: [...s.items, waterItem(id)] }))
      )
    );
    expect((await readQueue()).items.map((i) => i.id).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('skips the write when the change returns the same state', async () => {
    await updateQueue((s) => s);
    expect(await AsyncStorage.getItem(QUEUE_KEY)).toBeNull();
  });

  it('keeps a copy of unparseable data and carries on with an empty queue', async () => {
    await AsyncStorage.setItem(QUEUE_KEY, '{not json');
    expect((await readQueue()).items).toEqual([]);
    expect(await AsyncStorage.getItem(CORRUPT_KEY)).toBe('{not json');
  });

  it('keeps unreadable entries aside and returns the good ones', async () => {
    await AsyncStorage.setItem(
      QUEUE_KEY,
      JSON.stringify({
        items: [foodItem('good'), { id: 'bad' }],
        attention: [],
      })
    );
    const queue = await readQueue();
    expect(queue.items.map((i) => i.id)).toEqual(['good']);
    expect(
      JSON.parse((await AsyncStorage.getItem(CORRUPT_KEY)) ?? '[]')
    ).toEqual([{ id: 'bad' }]);
  });

  it('keeps working after one change throws', async () => {
    await expect(
      updateQueue(() => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    await updateQueue((s) => ({ ...s, items: [foodItem('after')] }));
    expect((await readQueue()).items).toHaveLength(1);
  });
});
