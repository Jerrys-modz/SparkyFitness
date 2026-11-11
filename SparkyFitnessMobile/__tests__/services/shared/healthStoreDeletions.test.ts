import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncHydrationDeletions } from '../../../src/services/shared/healthStoreDeletions';
import { postHealthDataDeletions } from '../../../src/services/api/healthDataDeletionsApi';
import { ApiError } from '../../../src/services/api/errors';
import type { ServerConfig } from '../../../src/services/storage';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../../src/services/api/healthDataDeletionsApi', () => ({
  postHealthDataDeletions: jest.fn(),
}));

const mockPost = postHealthDataDeletions as jest.MockedFunction<
  typeof postHealthDataDeletions
>;

const config: ServerConfig = {
  id: 'server-1',
  url: 'https://sparky.example',
  apiKey: 'key',
};
const ANCHOR_KEY = '@HealthStoreDeletions:waterAnchor:server-1';

describe('syncHydrationDeletions', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('sends deleted ids to the server and saves the new anchor', async () => {
    await AsyncStorage.setItem(ANCHOR_KEY, 'anchor-1');
    const read = jest
      .fn()
      .mockResolvedValue({ ids: ['A', 'B'], newAnchor: 'anchor-2' });
    mockPost.mockResolvedValue({ deleted: 1 });

    const result = await syncHydrationDeletions(
      read,
      config,
      'HealthKit',
      '[Test]'
    );

    expect(read).toHaveBeenCalledWith('anchor-1');
    expect(mockPost).toHaveBeenCalledWith(
      { type: 'water', source: 'HealthKit', source_ids: ['A', 'B'] },
      config
    );
    expect(result).toEqual({ found: 2, deleted: 1 });
    expect(await AsyncStorage.getItem(ANCHOR_KEY)).toBe('anchor-2');
  });

  it('only saves the anchor when nothing was deleted', async () => {
    const read = jest.fn().mockResolvedValue({ ids: [], newAnchor: 'first' });

    await syncHydrationDeletions(read, config, 'HealthKit', '[Test]');

    expect(read).toHaveBeenCalledWith(undefined);
    expect(mockPost).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(ANCHOR_KEY)).toBe('first');
  });

  it('keeps the old anchor when the upload fails, so the deletions are re-read', async () => {
    await AsyncStorage.setItem(ANCHOR_KEY, 'anchor-1');
    const read = jest
      .fn()
      .mockResolvedValue({ ids: ['A'], newAnchor: 'anchor-2' });
    mockPost.mockRejectedValue(new Error('network down'));

    await expect(
      syncHydrationDeletions(read, config, 'HealthKit', '[Test]')
    ).rejects.toThrow('network down');
    expect(await AsyncStorage.getItem(ANCHOR_KEY)).toBe('anchor-1');
  });

  it('moves the anchor on when the server predates the endpoint', async () => {
    const read = jest
      .fn()
      .mockResolvedValue({ ids: ['A'], newAnchor: 'anchor-2' });
    mockPost.mockRejectedValue(new ApiError('Not found', 404));

    const result = await syncHydrationDeletions(
      read,
      config,
      'HealthKit',
      '[Test]'
    );

    expect(result).toEqual({ found: 1, deleted: 0 });
    expect(await AsyncStorage.getItem(ANCHOR_KEY)).toBe('anchor-2');
  });
});
