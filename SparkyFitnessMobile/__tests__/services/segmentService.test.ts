import {
  findSegmentEfforts,
  MATCH_MAX_ROUNDS,
  removeSegment,
  renameSegment,
  saveSegment,
} from '../../src/services/segmentService';
import * as api from '../../src/services/api/segmentApi';
import { queryClient } from '../../src/hooks/queryClient';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/api/segmentApi');
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

beforeEach(() => {
  jest.clearAllMocks();
  invalidate.mockResolvedValue(undefined);
});

describe('findSegmentEfforts', () => {
  it('keeps asking while the server has more to read, and totals what it found', async () => {
    jest
      .mocked(api.matchSegment)
      .mockResolvedValueOnce({ scanned: 100, found: 20, hasMore: true })
      .mockResolvedValueOnce({ scanned: 100, found: 5, hasMore: true })
      .mockResolvedValueOnce({ scanned: 12, found: 1, hasMore: false });
    expect(await findSegmentEfforts('s1')).toBe(26);
    expect(api.matchSegment).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['segments', 's1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['segments'] });
  });

  it('stops at the round limit', async () => {
    jest
      .mocked(api.matchSegment)
      .mockResolvedValue({ scanned: 100, found: 0, hasMore: true });
    await findSegmentEfforts('s1');
    expect(api.matchSegment).toHaveBeenCalledTimes(MATCH_MAX_ROUNDS);
  });

  it('keeps what it found when a batch fails, and logs it', async () => {
    jest
      .mocked(api.matchSegment)
      .mockResolvedValueOnce({ scanned: 100, found: 7, hasMore: true })
      .mockRejectedValueOnce(new Error('offline'));
    expect(await findSegmentEfforts('s1')).toBe(7);
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('offline'),
      'WARNING'
    );
    expect(invalidate).toHaveBeenCalled();
  });
});

describe('segment actions', () => {
  it('saves a segment, then looks for past efforts without waiting for them', async () => {
    jest
      .mocked(api.createSegment)
      .mockResolvedValue({ segment: { id: 's9' } as never });
    jest
      .mocked(api.matchSegment)
      .mockResolvedValue({ scanned: 0, found: 0, hasMore: false });
    const segment = await saveSegment({
      mode: 'points',
      points: [],
      activity: 'run',
    } as never);
    expect(segment.id).toBe('s9');
    await Promise.resolve();
    expect(api.matchSegment).toHaveBeenCalledWith('s9');
  });

  it('still saves when the first search fails', async () => {
    jest
      .mocked(api.createSegment)
      .mockResolvedValue({ segment: { id: 's9' } as never });
    jest.mocked(api.matchSegment).mockRejectedValue(new Error('boom'));
    await expect(saveSegment({} as never)).resolves.toMatchObject({ id: 's9' });
  });

  it('renames, allowing the name to be cleared', async () => {
    jest
      .mocked(api.updateSegment)
      .mockResolvedValue({ segment: { id: 's1' } as never });
    await renameSegment('s1', null);
    expect(api.updateSegment).toHaveBeenCalledWith('s1', { name: null });
  });

  it('deletes and refreshes the lists, including run summaries', async () => {
    jest.mocked(api.deleteSegment).mockResolvedValue(undefined);
    await removeSegment('s1');
    expect(api.deleteSegment).toHaveBeenCalledWith('s1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['segments'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['segments', 'entry'],
    });
  });
});
