import {
  createSegment,
  deleteSegment,
  fetchEntrySegmentEfforts,
  fetchSegmentEfforts,
  fetchSegments,
  matchSegment,
  updateSegment,
} from '../../src/services/api/segmentApi';
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
