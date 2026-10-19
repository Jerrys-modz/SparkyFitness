import {
  createSegment,
  deleteSegment,
  fetchEntrySegmentEfforts,
  fetchSegmentEfforts,
  fetchSegments,
  matchSegment,
  updateSegment,
} from '../../src/services/api/segmentApi';
import {
  fetchHeatmap,
  fetchHeatmapTracks,
  heatmapQuery,
  heatmapTracksQuery,
} from '../../src/services/api/heatmapApi';
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

describe('heatmap tracks API', () => {
  const view = { minLat: 40, maxLat: 41, minLon: -75, maxLon: -74 };

  it('always sends the box, with filters and caps when given', () => {
    const bare = new URLSearchParams(heatmapTracksQuery({ view }).slice(1));
    expect(bare.get('minLat')).toBe('40');
    expect(bare.get('maxLon')).toBe('-74');
    expect(bare.has('activities')).toBe(false);
    expect(bare.has('maxTracks')).toBe(false);

    const full = new URLSearchParams(
      heatmapTracksQuery({
        activities: ['run', 'ride'],
        from: '2026-01-01',
        to: '2026-06-30',
        view,
        maxTracks: 300,
        maxPoints: 20000,
      }).slice(1)
    );
    expect(full.get('activities')).toBe('run,ride');
    expect(full.get('from')).toBe('2026-01-01');
    expect(full.get('to')).toBe('2026-06-30');
    expect(full.get('maxTracks')).toBe('300');
    expect(full.get('maxPoints')).toBe('20000');
  });

  it('calls the tracks endpoint', async () => {
    await fetchHeatmapTracks({ view, activities: ['walk'] });
    const call = lastCall() as { endpoint: string; timeoutMs: number };
    expect(call.endpoint).toMatch(
      /^\/api\/v2\/heatmap\/tracks\?activities=walk&minLat=40/
    );
    expect(call.timeoutMs).toBe(60_000);
  });
});
