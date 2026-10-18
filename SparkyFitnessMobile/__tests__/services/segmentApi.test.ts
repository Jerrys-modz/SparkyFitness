import {
  createSegment,
  deleteSegment,
  fetchEntrySegmentEfforts,
  fetchSegmentEfforts,
  fetchSegments,
  matchSegment,
  updateSegment,
} from '../../src/services/api/segmentApi';
import { fetchHeatmap, heatmapQuery } from '../../src/services/api/heatmapApi';
import { apiFetch } from '../../src/services/api/apiClient';

jest.mock('../../src/services/api/apiClient', () => ({ apiFetch: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const lastCall = () => jest.mocked(apiFetch).mock.calls.at(-1)?.[0];

describe('segment API', () => {
  it('lists and reads segments under /api/v2', async () => {
    await fetchSegments();
    expect(lastCall()).toMatchObject({ endpoint: '/api/v2/segments' });
    await fetchSegmentEfforts('s1');
    expect(lastCall()).toMatchObject({ endpoint: '/api/v2/segments/s1' });
  });

  it('creates, renames and deletes', async () => {
    const body = { mode: 'points', points: [], activity: 'run' } as never;
    await createSegment(body);
    expect(lastCall()).toMatchObject({
      endpoint: '/api/v2/segments',
      method: 'POST',
      body,
    });
    await updateSegment('s1', { name: null });
    expect(lastCall()).toMatchObject({
      endpoint: '/api/v2/segments/s1',
      method: 'PATCH',
      body: { name: null },
    });
    await deleteSegment('s1');
    expect(lastCall()).toMatchObject({
      endpoint: '/api/v2/segments/s1',
      method: 'DELETE',
    });
  });

  it('matches with a generous timeout and reads an activity’s efforts', async () => {
    await matchSegment('s1');
    expect(lastCall()).toMatchObject({
      endpoint: '/api/v2/segments/s1/match',
      method: 'POST',
      timeoutMs: 60_000,
    });
    await fetchEntrySegmentEfforts('e 1');
    expect(lastCall()).toMatchObject({
      endpoint: '/api/v2/segments/entries/e%201/efforts',
    });
  });
});

describe('heatmap API', () => {
  it('sends no query for the default view', () => {
    expect(heatmapQuery({})).toBe('');
  });

  it('sends filters and the viewport', () => {
    const query = heatmapQuery({
      activities: ['run', 'ride'],
      from: '2026-01-01',
      view: { minLat: 40, maxLat: 41, minLon: -75, maxLon: -74 },
      maxCells: 900,
    });
    const params = new URLSearchParams(query.slice(1));
    expect(params.get('activities')).toBe('run,ride');
    expect(params.get('from')).toBe('2026-01-01');
    expect(params.get('minLat')).toBe('40');
    expect(params.get('maxLon')).toBe('-74');
    expect(params.get('maxCells')).toBe('900');
    expect(params.has('to')).toBe(false);
  });

  it('calls the heatmap endpoint', async () => {
    await fetchHeatmap({ activities: ['walk'] });
    expect(lastCall()).toMatchObject({
      endpoint: '/api/v2/heatmap?activities=walk',
      timeoutMs: 60_000,
    });
  });
});
