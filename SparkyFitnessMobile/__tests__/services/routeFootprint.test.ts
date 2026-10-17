import { loadRouteFootprint } from '../../src/services/routeFootprint';
import { fetchRoute, fetchRoutes } from '../../src/services/api/routeApi';

jest.mock('../../src/services/api/routeApi', () => ({
  fetchRoutes: jest.fn(),
  fetchRoute: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const line = (north: number) =>
  Array.from({ length: 20 }, (_, i) => ({
    lat: 51.5 + north / 111_195,
    lon: -0.12 + (i * 20) / 69_000,
  }));
const mine = { id: 'me', points: line(0) };

beforeEach(() => jest.clearAllMocks());

describe('loadRouteFootprint', () => {
  it('fetches the other routes that start nearby and draws them', async () => {
    (fetchRoutes as jest.Mock).mockResolvedValue({
      routes: [
        { id: 'me', start: mine.points[0] },
        { id: 'near', start: line(150)[0] },
        { id: 'far', start: { lat: 40, lon: 10 } },
      ],
    });
    (fetchRoute as jest.Mock).mockResolvedValue({
      route: { id: 'near', points: line(150) },
    });
    const footprint = await loadRouteFootprint(mine);
    expect(fetchRoute).toHaveBeenCalledTimes(1);
    expect(fetchRoute).toHaveBeenCalledWith('near');
    expect(footprint).toHaveLength(1);
  });

  it('skips a route that fails to load', async () => {
    (fetchRoutes as jest.Mock).mockResolvedValue({
      routes: [
        { id: 'a', start: line(100)[0] },
        { id: 'b', start: line(200)[0] },
      ],
    });
    (fetchRoute as jest.Mock)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ route: { id: 'b', points: line(200) } });
    expect(await loadRouteFootprint(mine)).toHaveLength(1);
  });

  it('gives no footprint, rather than failing, when the list cannot be read', async () => {
    (fetchRoutes as jest.Mock).mockRejectedValue(new Error('offline'));
    expect(await loadRouteFootprint(mine)).toEqual([]);
  });
});
