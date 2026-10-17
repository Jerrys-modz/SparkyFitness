import { loadWatchGhost } from '../../src/services/watchRouteGhost';
import { fetchRouteGhost } from '../../src/services/api/routeApi';

jest.mock('../../src/services/api/routeApi', () => ({
  fetchRouteGhost: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const fetchMock = fetchRouteGhost as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('loadWatchGhost', () => {
  it('returns the server’s pace line', async () => {
    fetchMock.mockResolvedValue({
      ghost: {
        entryId: 'e1',
        durationSeconds: 95,
        intervalM: 100,
        splits: [30, 61, 95],
        source: 'track',
      },
    });
    await expect(loadWatchGhost('r1')).resolves.toEqual([30, 61, 95]);
    expect(fetchMock).toHaveBeenCalledWith('r1');
  });

  it('is null for a route with no timed run', async () => {
    fetchMock.mockResolvedValue({ ghost: null });
    await expect(loadWatchGhost('r1')).resolves.toBeNull();
  });

  it('is null, not an error, when the lookup fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(loadWatchGhost('r1')).resolves.toBeNull();
  });
});
