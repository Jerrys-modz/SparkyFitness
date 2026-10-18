import { heatmapQueryString, loadHeatmap } from '@/api/Reports/heatmapService';
import { apiCall } from '@/api/api';

jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));

describe('heatmap service', () => {
  it('leaves out empty filters', () => {
    expect(heatmapQueryString({})).toBe('');
    expect(heatmapQueryString({ activities: [] })).toBe('');
  });

  it('sends filters and the viewport', () => {
    const params = new URLSearchParams(
      heatmapQueryString({
        activities: ['run', 'walk'],
        from: '2026-01-01',
        to: '2026-02-01',
        view: { minLat: 40, maxLat: 41, minLon: -75, maxLon: -74 },
        maxCells: 2500,
      }).slice(1)
    );
    expect(params.get('activities')).toBe('run,walk');
    expect(params.get('from')).toBe('2026-01-01');
    expect(params.get('to')).toBe('2026-02-01');
    expect(params.get('minLat')).toBe('40');
    expect(params.get('maxLon')).toBe('-74');
    expect(params.get('maxCells')).toBe('2500');
  });

  it('calls the v2 endpoint without a user id', async () => {
    await loadHeatmap({ activities: ['ride'] });
    expect(apiCall).toHaveBeenCalledWith('/v2/heatmap?activities=ride', {
      method: 'GET',
    });
  });
});
