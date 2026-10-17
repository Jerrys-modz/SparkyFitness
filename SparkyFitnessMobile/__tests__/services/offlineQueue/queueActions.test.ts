import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelQueuedItem,
  discardAttentionItem,
  onOfflineQueueIdentityChanged,
  purgeOfflineQueueForConfig,
} from '../../../src/services/offlineQueue/queueActions';
import { toAttention } from '../../../src/services/offlineQueue/queueLogic';
import { useOfflineQueueStore } from '../../../src/stores/offlineQueueStore';
import { drainQueue } from '../../../src/services/offlineQueue/queueRunner';
import { clearPersistedQueryCache } from '../../../src/services/queryCachePersistence';
import { getActiveServerConfig } from '../../../src/services/storage';
import { foodItem, waterItem } from '../../helpers/offlineQueue';

jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));
jest.mock('../../../src/services/queryCachePersistence', () => ({
  clearPersistedQueryCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/services/offlineQueue/queueRunner', () => ({
  drainQueue: jest
    .fn()
    .mockResolvedValue({ sent: 0, needsAttention: 0, stopped: 'done' }),
}));

const initialStore = useOfflineQueueStore.getState();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useOfflineQueueStore.setState({
    ...initialStore,
    items: [],
    attention: [],
    accounts: {},
    activeConfigId: null,
  });
});

describe('queue actions', () => {
  it('cancels a queued item and nothing else', async () => {
    await useOfflineQueueStore
      .getState()
      .commit((s) => ({ ...s, items: [foodItem('a'), waterItem('b')] }));

    await cancelQueuedItem('a');

    expect(useOfflineQueueStore.getState().items.map((i) => i.id)).toEqual([
      'b',
    ]);
  });

  it('discards a needs-attention item', async () => {
    await useOfflineQueueStore.getState().commit((s) => ({
      ...s,
      attention: [toAttention(foodItem('a'), 'rejected', 'x', 0)],
    }));

    await discardAttentionItem('a');

    expect(useOfflineQueueStore.getState().attention).toEqual([]);
  });

  it('purges everything queued for a deleted server and keeps the rest', async () => {
    await useOfflineQueueStore.getState().commit(() => ({
      items: [foodItem('mine'), { ...foodItem('gone'), configId: 'config-2' }],
      attention: [
        toAttention(
          { ...foodItem('gone-too'), configId: 'config-2' },
          'rejected',
          'x',
          0
        ),
      ],
      accounts: { 'config-1': 'user-1', 'config-2': 'user-2' },
    }));

    await purgeOfflineQueueForConfig('config-2');

    const state = useOfflineQueueStore.getState();
    expect(state.items.map((i) => i.id)).toEqual(['mine']);
    expect(state.attention).toEqual([]);
    expect(state.accounts).toEqual({ 'config-1': 'user-1' });
  });

  it('drops the cached read data on an identity change but keeps the queue, then drains', async () => {
    jest.mocked(getActiveServerConfig).mockResolvedValue({
      id: 'config-9',
      url: 'https://example.test',
      apiKey: '',
    });
    await useOfflineQueueStore
      .getState()
      .commit((s) => ({ ...s, items: [foodItem('keep')] }));

    await onOfflineQueueIdentityChanged();

    expect(clearPersistedQueryCache).toHaveBeenCalled();
    expect(useOfflineQueueStore.getState().activeConfigId).toBe('config-9');
    expect(useOfflineQueueStore.getState().items.map((i) => i.id)).toEqual([
      'keep',
    ]);
    expect(drainQueue).toHaveBeenCalled();
  });
});
